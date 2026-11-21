import * as Notifications from "expo-notifications";
import type { SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";

type ExpiredDoseRecord = {
  id: number;
  user_id: string;
  name: string;
  dose: string;
};

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLocalTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

let expiryQueue: Promise<number> = Promise.resolve(0);

export function markExpiredMedicationDoses(
  database: SQLiteDatabase,
  now: Date = new Date(),
): Promise<number> {
  const result = expiryQueue.then(
    () => performMarkExpiredMedicationDoses(database, now),
    () => performMarkExpiredMedicationDoses(database, now),
  );
  expiryQueue = result;
  return result;
}

async function performMarkExpiredMedicationDoses(
  database: SQLiteDatabase,
  now: Date,
): Promise<number> {
  const cutoff = new Date(now.getTime() - 5 * 60 * 1000);
  const cutoffDate = formatLocalDate(cutoff);
  const cutoffTime = formatLocalTime(cutoff);
  const recordedAt = now.toISOString();

  const expiredRecords = await database.getAllAsync<ExpiredDoseRecord>(
    `SELECT h.id, h.user_id, m.name, m.dose
     FROM medication_history h
     JOIN medicines m ON m.id = h.medicine_id
     WHERE h.status = 'PENDING'
       AND (
         h.scheduled_date < ?
         OR (h.scheduled_date = ? AND h.scheduled_time <= ?)
       )`,
    cutoffDate,
    cutoffDate,
    cutoffTime,
  );
  if (expiredRecords.length === 0) return 0;

  const result = await database.runAsync(
    `UPDATE medication_history
     SET status = 'MISSED', recorded_at = ?
     WHERE status = 'PENDING'
       AND (
         scheduled_date < ?
         OR (scheduled_date = ? AND scheduled_time <= ?)
       )`,
    recordedAt,
    cutoffDate,
    cutoffDate,
    cutoffTime,
  );
  if (result.changes > 0) {
    try {
      await notifyNewlyMissedDoses(database, expiredRecords, recordedAt);
    } catch (error) {
      console.error("Could not notify about missed medication doses:", error);
    }
  }
  return result.changes;
}

async function notifyNewlyMissedDoses(
  database: SQLiteDatabase,
  candidates: ExpiredDoseRecord[],
  recordedAt: string,
): Promise<void> {
  if (Platform.OS === "web") return;
  const permissions = await Notifications.getPermissionsAsync();
  const iosStatus = permissions.ios?.status;
  if (
    permissions.status !== "granted" &&
    iosStatus !== Notifications.IosAuthorizationStatus.AUTHORIZED &&
    iosStatus !== Notifications.IosAuthorizationStatus.PROVISIONAL &&
    iosStatus !== Notifications.IosAuthorizationStatus.EPHEMERAL
  ) {
    return;
  }

  const ids = candidates.map((candidate) => candidate.id);
  const missed = await database.getAllAsync<ExpiredDoseRecord>(
    `SELECT h.id, h.user_id, m.name, m.dose
     FROM medication_history h
     JOIN medicines m ON m.id = h.medicine_id
     WHERE h.id IN (${ids.map(() => "?").join(", ")})
       AND h.status = 'MISSED'
       AND h.recorded_at = ?
       AND COALESCE((
         SELECT setting_value
         FROM profile_settings
         WHERE profile_id = h.user_id
           AND setting_key = 'notifications.missedDose'
       ), 'true') = 'true'`,
    ...ids,
    recordedAt,
  );
  if (missed.length === 0) return;

  const message =
    missed.length === 1
      ? `${missed[0].name}: ${missed[0].dose} was marked missed.`
      : `${missed.length} medication doses were marked missed. Open MediMate to review.`;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: missed.length === 1 ? "Missed medication dose" : "Missed medication doses",
      body: message,
      sound: "default",
      data: {
        kind: "missed-dose-reminder",
        doseIds: missed.map((record) => record.id),
      },
    },
    trigger: null,
  });
}

export async function markMedicationDoseTaken(
  database: SQLiteDatabase,
  doseId: number,
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  await markExpiredMedicationDoses(database, now);

  const recordedAt = now.toISOString();
  const result = await database.runAsync(
    `UPDATE medication_history
     SET status = 'TAKEN', taken_at = ?, recorded_at = ?
     WHERE id = ? AND user_id = ? AND status = 'PENDING'`,
    recordedAt,
    recordedAt,
    doseId,
    userId,
  );
  return result.changes === 1;
}
