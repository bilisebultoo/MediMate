import type { SQLiteDatabase } from "expo-sqlite";

export function configureMedicationDoseNotifications() {}

export async function requestMedicationDosePermissions(): Promise<boolean> {
  return false;
}

export async function refreshMedicationDoseNotifications(
  _database: SQLiteDatabase,
): Promise<number> {
  return 0;
}
