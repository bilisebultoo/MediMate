import type { SQLiteDatabase } from "expo-sqlite";

export type NotificationSettingKey =
  | "medication"
  | "missedDose"
  | "refill"
  | "appointment"
  | "health";

export type NotificationSettings = Record<NotificationSettingKey, boolean>;

export type ThemeMode = "light" | "dark" | "system";

const NOTIFICATION_SETTING_KEYS = [
  "medication",
  "missedDose",
  "refill",
  "appointment",
  "health",
] as const;

export async function getProfileSetting(
  database: SQLiteDatabase,
  profileId: string,
  key: string,
): Promise<string | null> {
  const record = await database.getFirstAsync<{ setting_value: string }>(
    `SELECT setting_value
     FROM profile_settings
     WHERE profile_id = ? AND setting_key = ?`,
    profileId,
    key,
  );
  return record?.setting_value ?? null;
}

export async function setProfileSetting(
  database: SQLiteDatabase,
  profileId: string,
  key: string,
  value: string,
): Promise<void> {
  await database.runAsync(
    `INSERT INTO profile_settings (
      profile_id, setting_key, setting_value, updated_at
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(profile_id, setting_key) DO UPDATE SET
      setting_value = excluded.setting_value,
      updated_at = excluded.updated_at`,
    profileId,
    key,
    value,
    new Date().toISOString(),
  );
}

export async function getNotificationSettings(
  database: SQLiteDatabase,
  profileId: string,
): Promise<NotificationSettings> {
  const records = await database.getAllAsync<{
    setting_key: string;
    setting_value: string;
  }>(
    `SELECT setting_key, setting_value
     FROM profile_settings
     WHERE profile_id = ? AND setting_key LIKE 'notifications.%'`,
    profileId,
  );
  const stored = new Map(
    records.map((record) => [
      record.setting_key.slice("notifications.".length),
      record.setting_value,
    ]),
  );
  const isEnabled = (key: NotificationSettingKey) =>
    stored.get(key) !== "false";
  return {
    medication: isEnabled("medication"),
    missedDose: isEnabled("missedDose"),
    refill: isEnabled("refill"),
    appointment: isEnabled("appointment"),
    health: isEnabled("health"),
  };
}

export async function setNotificationSetting(
  database: SQLiteDatabase,
  profileId: string,
  key: NotificationSettingKey,
  enabled: boolean,
): Promise<void> {
  await setProfileSetting(
    database,
    profileId,
    `notifications.${key}`,
    String(enabled),
  );
}

export function isNotificationSettingKey(
  value: string,
): value is NotificationSettingKey {
  return NOTIFICATION_SETTING_KEYS.some((key) => key === value);
}
