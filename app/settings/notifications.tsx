import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { SafeAreaView } from "react-native-safe-area-context";

import { useUserProfiles } from "@/context/UserContext";
import {
  getNotificationSettings,
  setNotificationSetting,
  type NotificationSettingKey,
  type NotificationSettings,
} from "@/services/profileSettingsService";
import { refreshAppointmentNotifications } from "@/services/appointmentNotifications";
import { refreshHealthReminderNotifications } from "@/services/healthReminderNotifications";
import { refreshMedicationDoseNotifications } from "@/services/medicationDoseNotifications";
import { refreshRefillNotifications } from "@/services/refillNotifications";
import { useTheme } from "@/hooks/use-theme";

const NOTIFICATION_OPTIONS: {
  key: NotificationSettingKey;
  title: string;
  description: string;
}[] = [
  {
    key: "medication",
    title: "Medication reminders",
    description: "Alerts at scheduled medication times.",
  },
  {
    key: "missedDose",
    title: "Missed-dose alerts",
    description: "Alert when a dose is marked as missed.",
  },
  {
    key: "refill",
    title: "Refill reminders",
    description: "Alert 3 days before a medicine's end date.",
  },
  {
    key: "appointment",
    title: "Appointment reminders",
    description: "Advance alerts and alerts at appointment time.",
  },
  {
    key: "health",
    title: "Health measurement reminders",
    description: "Scheduled reminders to measure your health metrics.",
  },
];

const DEFAULT_SETTINGS: NotificationSettings = {
  medication: true,
  missedDose: true,
  refill: true,
  appointment: true,
  health: true,
};

export default function NotificationSettingsScreen() {
  const database = useSQLiteContext();
  const { activeProfile, isLoading: profileLoading } = useUserProfiles();
  const profileId = activeProfile?.id ?? null;
  const colors = useTheme();
  const [settings, setSettings] =
    useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [loadedProfileId, setLoadedProfileId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingKey, setSavingKey] =
    useState<NotificationSettingKey | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!profileId) return;
      let isCurrent = true;
      void getNotificationSettings(database, profileId)
        .then((value) => {
          if (!isCurrent) return;
          setSettings(value);
          setLoadedProfileId(profileId);
          setLoadError(null);
        })
        .catch((error: unknown) => {
          console.error("Could not load notification preferences:", error);
          if (!isCurrent) return;
          setLoadedProfileId(profileId);
          setLoadError("Notification preferences could not be loaded.");
        });
      return () => {
        isCurrent = false;
      };
    }, [database, profileId]),
  );

  const refreshNotifications = async (key: NotificationSettingKey) => {
    switch (key) {
      case "medication":
        await refreshMedicationDoseNotifications(database);
        return;
      case "appointment":
        await refreshAppointmentNotifications(database);
        return;
      case "refill":
        await refreshRefillNotifications(database);
        return;
      case "health":
        await refreshHealthReminderNotifications(database);
        return;
      case "missedDose":
        return;
    }
  };

  const handleToggle = async (
    key: NotificationSettingKey,
    enabled: boolean,
  ) => {
    if (!profileId || savingKey) return;
    setSavingKey(key);
    try {
      await setNotificationSetting(database, profileId, key, enabled);
      setSettings((current) => ({ ...current, [key]: enabled }));
    } catch (error) {
      console.error("Could not save notification preference:", error);
      Alert.alert(
        "Could not save setting",
        "Your notification preference was not changed. Please try again.",
      );
      setSavingKey(null);
      return;
    }

    try {
      await refreshNotifications(key);
    } catch (error) {
      console.error("Could not refresh scheduled notifications:", error);
      Alert.alert(
        "Preference saved",
        "The setting was saved, but scheduled reminders could not be refreshed. Reopen MediMate to try again.",
      );
    } finally {
      setSavingKey(null);
    }
  };

  if (profileLoading || (profileId && loadedProfileId !== profileId)) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <Text style={[styles.status, { color: colors.textSecondary }]}>
          Loading notification settings...
        </Text>
      </SafeAreaView>
    );
  }

  if (!profileId) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <Text style={[styles.status, { color: colors.textSecondary }]}>
          Select a profile to manage its notification settings.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>
          Notification settings
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Choose which reminders {activeProfile?.name ?? "this profile"} receives.
        </Text>

        {loadError ? (
          <Text style={[styles.error, { color: colors.danger }]}>
            {loadError}
          </Text>
        ) : null}

        {NOTIFICATION_OPTIONS.map((option) => (
          <View
            key={option.key}
            style={[
              styles.optionCard,
              {
                backgroundColor: colors.backgroundElement,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.optionText}>
              <Text style={[styles.optionTitle, { color: colors.text }]}>
                {option.title}
              </Text>
              <Text
                style={[
                  styles.optionDescription,
                  { color: colors.textSecondary },
                ]}
              >
                {option.description}
              </Text>
            </View>
            <Switch
              accessibilityLabel={option.title}
              disabled={Boolean(savingKey) || Boolean(loadError)}
              onValueChange={(enabled) =>
                void handleToggle(option.key, enabled)
              }
              thumbColor={settings[option.key] ? colors.accent : undefined}
              trackColor={{
                false: colors.border,
                true: `${colors.accent}88`,
              }}
              value={settings[option.key]}
            />
          </View>
        ))}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/health/health-reminders")}
          style={[
            styles.manageButton,
            { borderColor: colors.border, backgroundColor: colors.backgroundElement },
          ]}
        >
          <Text style={[styles.manageButtonText, { color: colors.accent }]}>
            Manage health reminders
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 36,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
    marginTop: 6,
  },
  error: {
    fontSize: 14,
    marginBottom: 12,
  },
  optionCard: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 10,
    padding: 14,
  },
  optionText: {
    flex: 1,
    paddingRight: 8,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  optionDescription: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  manageButton: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 6,
    padding: 14,
  },
  manageButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  status: {
    padding: 24,
    textAlign: "center",
  },
});
