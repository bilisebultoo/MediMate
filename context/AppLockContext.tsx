import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";

import {
  DEFAULT_APP_LOCK_SETTINGS,
  loadAppLockSettings,
  updateAppLockSetting,
  verifyAppLockPin,
  type AppLockSettings,
} from "@/services/appLockService";

type AppLockContextValue = {
  settings: AppLockSettings;
  isLocked: boolean;
  isReady: boolean;
  loadError: boolean;
  unlockWithPin: (pin: string) => Promise<boolean>;
  unlockWithBiometrics: () => Promise<boolean>;
  updateSetting: (
    key: "enabled" | "biometrics" | "timeoutMinutes",
    value: boolean | number,
  ) => Promise<void>;
  reload: () => Promise<void>;
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function AppLockProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(DEFAULT_APP_LOCK_SETTINGS);
  const [isLocked, setIsLocked] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const settingsRef = useRef(settings);

  const reload = useCallback(async () => {
    setIsReady(false);
    try {
      const saved = await loadAppLockSettings();
      settingsRef.current = saved;
      setSettings(saved);
      setIsLocked(saved.enabled);
      setLoadError(false);
    } catch (error) {
      console.error("Could not load app lock settings:", error);
      setLoadError(true);
    } finally {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (state: AppStateStatus) => {
        const currentSettings = settingsRef.current;
        if (!currentSettings.enabled) return;

        if (state !== "active") {
          if (backgroundedAt.current === null) {
            backgroundedAt.current = Date.now();
          }
          if (currentSettings.timeoutMinutes === 0) setIsLocked(true);
          return;
        }

        const inactiveDuration =
          backgroundedAt.current === null
            ? 0
            : Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (inactiveDuration >= currentSettings.timeoutMinutes * 60_000) {
          setIsLocked(true);
        }
      },
    );
    return () => subscription.remove();
  }, []);

  const unlockWithPin = useCallback(async (pin: string) => {
    const valid = await verifyAppLockPin(pin);
    if (valid) setIsLocked(false);
    return valid;
  }, []);

  const unlockWithBiometrics = useCallback(async () => {
    if (!settingsRef.current.biometrics) return false;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock MediMate",
      cancelLabel: "Use PIN",
      disableDeviceFallback: true,
    });
    if (result.success) setIsLocked(false);
    return result.success;
  }, []);

  const updateSetting = useCallback(
    async (
      key: "enabled" | "biometrics" | "timeoutMinutes",
      value: boolean | number,
    ) => {
      await updateAppLockSetting(key, value);
      const updated = { ...settingsRef.current, [key]: value };
      settingsRef.current = updated;
      setSettings(updated);
      if (key === "enabled" && value === false) setIsLocked(false);
    },
    [],
  );

  const value = useMemo(
    () => ({
      settings,
      isLocked,
      isReady,
      loadError,
      unlockWithPin,
      unlockWithBiometrics,
      updateSetting,
      reload,
    }),
    [
      settings,
      isLocked,
      isReady,
      loadError,
      unlockWithPin,
      unlockWithBiometrics,
      updateSetting,
      reload,
    ],
  );

  return (
    <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>
  );
}

export function useAppLock() {
  const context = useContext(AppLockContext);
  if (!context) {
    throw new Error("useAppLock must be used within AppLockProvider");
  }
  return context;
}
