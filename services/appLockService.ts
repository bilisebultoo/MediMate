import * as SecureStore from "expo-secure-store";

const PIN_KEY = "app-lock.pin";
const ENABLED_KEY = "app-lock.enabled";
const BIOMETRICS_KEY = "app-lock.biometrics";
const TIMEOUT_KEY = "app-lock.timeout-minutes";

export type AppLockSettings = {
  enabled: boolean;
  biometrics: boolean;
  timeoutMinutes: number;
};

export const DEFAULT_APP_LOCK_SETTINGS: AppLockSettings = {
  enabled: false,
  biometrics: false,
  timeoutMinutes: 5,
};

const TIMEOUT_OPTIONS = [0, 1, 5, 15, 30];

export async function loadAppLockSettings(): Promise<AppLockSettings> {
  const [enabled, biometrics, timeout] = await Promise.all([
    SecureStore.getItemAsync(ENABLED_KEY),
    SecureStore.getItemAsync(BIOMETRICS_KEY),
    SecureStore.getItemAsync(TIMEOUT_KEY),
  ]);
  const parsedTimeout = Number(timeout);

  return {
    enabled: enabled === "true",
    biometrics: biometrics === "true",
    timeoutMinutes: TIMEOUT_OPTIONS.includes(parsedTimeout)
      ? parsedTimeout
      : DEFAULT_APP_LOCK_SETTINGS.timeoutMinutes,
  };
}

export async function hasAppLockPin(): Promise<boolean> {
  return (await SecureStore.getItemAsync(PIN_KEY)) !== null;
}

export async function verifyAppLockPin(pin: string): Promise<boolean> {
  return (await SecureStore.getItemAsync(PIN_KEY)) === pin;
}

export async function saveAppLockPin(pin: string): Promise<void> {
  await SecureStore.setItemAsync(PIN_KEY, pin);
}

export async function updateAppLockSetting(
  key: "enabled" | "biometrics" | "timeoutMinutes",
  value: boolean | number,
): Promise<void> {
  const storeKey =
    key === "timeoutMinutes"
      ? TIMEOUT_KEY
      : key === "enabled"
        ? ENABLED_KEY
        : BIOMETRICS_KEY;
  await SecureStore.setItemAsync(storeKey, String(value));
}
