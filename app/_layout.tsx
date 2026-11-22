import {
  DarkTheme,
  DefaultTheme,
  router,
  Stack,
  ThemeProvider,
  useRootNavigationState,
} from "expo-router";
import { Suspense, useEffect, useRef, useState } from "react";

import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import {
  AppState,
  Platform,
  StyleSheet,
  useColorScheme,
  View,
} from "react-native";

import { AnimatedSplashOverlay } from "@/components/common/animated-icon";
import { AppLockGate } from "@/components/security/AppLockGate";
import { AppLockProvider, useAppLock } from "@/context/AppLockContext";
import { ThemeSettingsProvider } from "@/context/ThemeContext";
import { UserProvider } from "@/context/UserContext";
import { initializeDatabase } from "@/database";
import {
  configureAppointmentNotifications,
  refreshAppointmentNotifications,
} from "@/services/appointmentNotifications";
import { refreshHealthReminderNotifications } from "@/services/healthReminderNotifications";
import {
  configureMedicationDoseNotifications,
  refreshMedicationDoseNotifications,
} from "@/services/medicationDoseNotifications";
import { markExpiredMedicationDoses } from "@/services/medicationDoseStatus";
import { generateMedicationSchedules } from "@/services/medicationScheduleGenerator";
import { refreshRefillNotifications } from "@/services/refillNotifications";

SplashScreen.preventAutoHideAsync();

function NotificationNavigation() {
  if (Platform.OS === "web") return null;
  return <NativeNotificationNavigation />;
}

function NativeNotificationNavigation() {
  const { isReady, isLocked, loadError } = useAppLock();
  const navigationState = useRootNavigationState();
  const lastResponse = Notifications.useLastNotificationResponse();

  const handledResponseId = useRef<string | null>(null);
  const pendingHomeRedirect = useRef(false);
  const [responseVersion, setResponseVersion] = useState(0);

  const queueHomeRedirect = (
    response?: Notifications.NotificationResponse | null,
  ) => {
    const identifier =
      response?.notification?.request?.identifier ||
      (response
        ? JSON.stringify(response.notification?.request?.content?.data ?? {})
        : null);

    if (identifier && handledResponseId.current === identifier) {
      return;
    }

    if (identifier) {
      handledResponseId.current = identifier;
    }

    console.log("Notification tapped. Preparing Home redirect.");
    pendingHomeRedirect.current = true;
    setResponseVersion((version) => version + 1);
  };

  useEffect(() => {
    if (lastResponse) {
      queueHomeRedirect(lastResponse);
    }
  }, [lastResponse]);

  useEffect(() => {
    // 1. Listen whenever the user taps a notification while app is running / in foreground.
    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        console.log(
          "Notification response received:",
          response.notification?.request?.content?.title,
        );
        queueHomeRedirect(response);
      });

    // 2. Check for notification response on startup / resume.
    const checkNotificationResponse = async () => {
      try {
        const response = await Notifications.getLastNotificationResponseAsync();
        if (response) {
          console.log("App opened from notification response.");
          queueHomeRedirect(response);
        }
      } catch (error) {
        console.error("Error checking notification response:", error);
      }
    };

    void checkNotificationResponse();

    // 3. When returning from another app (e.g. Telegram) to foreground, re-check for notification tap.
    let timer1: ReturnType<typeof setTimeout> | null = null;
    let timer2: ReturnType<typeof setTimeout> | null = null;

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void checkNotificationResponse();
        if (timer1) clearTimeout(timer1);
        if (timer2) clearTimeout(timer2);
        timer1 = setTimeout(() => void checkNotificationResponse(), 150);
        timer2 = setTimeout(() => void checkNotificationResponse(), 450);
      }
    });

    return () => {
      responseSubscription.remove();
      appStateSubscription.remove();
      if (timer1) clearTimeout(timer1);
      if (timer2) clearTimeout(timer2);
    };
  }, []);

  useEffect(() => {
    if (
      !pendingHomeRedirect.current ||
      !isReady ||
      isLocked ||
      loadError ||
      !navigationState?.key
    ) {
      return;
    }

    console.log("Redirecting to MediMate Home screen (/home).");
    pendingHomeRedirect.current = false;

    const navigateToHome = () => {
      try {
        if (router.canDismiss()) {
          router.dismissAll();
        }
      } catch {
        // ignore if stack cannot be dismissed
      }

      try {
        router.dismissTo("/home");
      } catch {
        // fallback to navigate
      }

      try {
        router.navigate("/home");
      } catch {
        try {
          router.replace("/home");
        } catch (navError) {
          console.error("Navigation error to Home screen:", navError);
        }
      }
    };

    navigateToHome();
    const retryTimer = setTimeout(navigateToHome, 100);

    try {
      void Notifications.clearLastNotificationResponseAsync?.();
    } catch {
      // ignore if clearLastNotificationResponse is unavailable in current runtime
    }

    return () => {
      clearTimeout(retryTimer);
    };
  }, [
    responseVersion,
    isReady,
    isLocked,
    loadError,
    navigationState?.key,
  ]);

  return null;
}

function MedicationDoseScheduler() {
  const database = useSQLiteContext();
  const { isReady, isLocked } = useAppLock();

  useEffect(() => {
    if (!isReady || isLocked) return;
    let isActive = true;
    let isSyncing = false;
    let isExpiring = false;
    configureMedicationDoseNotifications();
    configureAppointmentNotifications();

    const expireOverdueDoses = async () => {
      if (isExpiring) return;
      isExpiring = true;
      try {
        const expiredCount = await markExpiredMedicationDoses(database);
        if (isActive && expiredCount > 0) {
          await refreshMedicationDoseNotifications(database);
        }
      } catch (error) {
        if (isActive) {
          console.error("Error expiring overdue medication doses:", error);
        }
      } finally {
        isExpiring = false;
      }
    };

    const syncDosesAndReminders = async () => {
      if (isSyncing) return;
      isSyncing = true;
      try {
        try {
          await generateMedicationSchedules(database);
        } catch (error) {
          if (isActive) {
            console.error("Error generating medication schedules:", error);
          }
        }

        if (!isActive) return;
        await markExpiredMedicationDoses(database);
        if (!isActive) return;
        await Promise.all([
          refreshMedicationDoseNotifications(database),
          refreshAppointmentNotifications(database),
          refreshRefillNotifications(database),
          refreshHealthReminderNotifications(database),
        ]);
      } catch (error) {
        if (isActive) {
          console.error("Error syncing medication doses and reminders:", error);
        }
      } finally {
        isSyncing = false;
      }
    };

    void syncDosesAndReminders();
    const expiryInterval = setInterval(() => {
      void expireOverdueDoses();
    }, 15_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncDosesAndReminders();
    });

    return () => {
      isActive = false;
      clearInterval(expiryInterval);
      subscription.remove();
    };
  }, [database, isReady, isLocked]);

  return null;
}

function AppNavigator() {
  const colorScheme = useColorScheme();
  const { isReady, isLocked, loadError } = useAppLock();

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <View style={styles.navigatorContainer}>
        <Stack screenOptions={{ headerShown: false }} />
        <NotificationNavigation />
        {isReady && !isLocked && !loadError ? null : (
          <View style={styles.lockOverlay}>
            <AppLockGate />
          </View>
        )}
        <AnimatedSplashOverlay />
      </View>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  navigatorContainer: { flex: 1 },
  lockOverlay: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 10,
  },
});

export default function RootLayout() {
  return (
    <Suspense fallback={null}>
      <SQLiteProvider
        databaseName="medimate.db"
        onInit={initializeDatabase}
        useSuspense
      >
        <UserProvider>
          <ThemeSettingsProvider>
            <AppLockProvider>
              <MedicationDoseScheduler />
              <AppNavigator />
            </AppLockProvider>
          </ThemeSettingsProvider>
        </UserProvider>
      </SQLiteProvider>
    </Suspense>
  );
}
