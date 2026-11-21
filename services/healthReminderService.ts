import type { SQLiteDatabase } from "expo-sqlite";

import type { HealthReminder, HealthReminderInput } from "@/types/healthReminder";

type HealthReminderRow = Omit<HealthReminder, "repeatDays" | "enabled"> & {
  repeatDays: string;
  enabled: number;
};

const HEALTH_REMINDER_COLUMNS = `
  id, user_id AS userId, metric, label, start_date AS startDate,
  scheduled_time AS scheduledTime, repeat_type AS repeatType,
  repeat_days AS repeatDays, enabled
`;

export async function getHealthReminders(
  database: SQLiteDatabase,
  userId: string,
): Promise<HealthReminder[]> {
  const rows = await database.getAllAsync<HealthReminderRow>(
    `SELECT ${HEALTH_REMINDER_COLUMNS}
     FROM health_reminders
     WHERE user_id = ?
     ORDER BY start_date, scheduled_time, id`,
    userId,
  );
  return rows.map((row) => {
    let repeatDays: unknown;
    try {
      repeatDays = JSON.parse(row.repeatDays) as unknown;
    } catch (error) {
      console.error("Invalid health reminder repeat days:", error);
      throw new Error("A health reminder has invalid repeat days.");
    }
    if (
      !Array.isArray(repeatDays) ||
      !repeatDays.every(
        (day) => Number.isInteger(day) && day >= 0 && day <= 6,
      )
    ) {
      throw new Error("A health reminder has invalid repeat days.");
    }
    return {
      ...row,
      repeatDays,
      enabled: row.enabled === 1,
    };
  });
}

export async function createHealthReminder(
  database: SQLiteDatabase,
  userId: string,
  reminder: HealthReminderInput,
): Promise<void> {
  await database.runAsync(
    `INSERT INTO health_reminders (
      user_id, metric, label, start_date, scheduled_time,
      repeat_type, repeat_days, enabled, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    userId,
    reminder.metric,
    reminder.label,
    reminder.startDate,
    reminder.scheduledTime,
    reminder.repeatType,
    JSON.stringify(reminder.repeatDays),
    new Date().toISOString(),
  );
}

export async function deleteHealthReminder(
  database: SQLiteDatabase,
  reminderId: number,
  userId: string,
): Promise<void> {
  const result = await database.runAsync(
    "DELETE FROM health_reminders WHERE id = ? AND user_id = ?",
    reminderId,
    userId,
  );
  if (result.changes !== 1) {
    throw new Error("The health reminder could not be found.");
  }
}
