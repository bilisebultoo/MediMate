import type { SQLiteDatabase } from 'expo-sqlite';

import type { HealthMetric, HealthRecord } from '@/types/health';

export type NewHealthRecord = {
  metric: HealthMetric;
  name: string;
  value: string;
  unit: string;
  recordedAt: Date;
  notes: string | null;
};

export type HealthRecordFilters = {
  fromDate?: string;
  search?: string;
  limit?: number;
};

export async function addHealthRecord(
  database: SQLiteDatabase,
  userId: string,
  record: NewHealthRecord,
): Promise<void> {
  const recordedAt = record.recordedAt.toISOString();
  const createdAt = new Date().toISOString();

  await database.runAsync(
    `INSERT INTO health_records (
      user_id, metric, name, value, unit, recorded_at, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    userId,
    record.metric,
    record.name,
    record.value,
    record.unit,
    recordedAt,
    record.notes,
    createdAt,
  );
}

export async function getHealthRecord(
  database: SQLiteDatabase,
  recordId: number,
  userId: string,
): Promise<HealthRecord | null> {
  return database.getFirstAsync<HealthRecord>(
    `SELECT id, metric, name, value, unit, recorded_at, notes
     FROM health_records
     WHERE id = ? AND user_id = ?`,
    recordId,
    userId,
  );
}

export async function updateHealthRecord(
  database: SQLiteDatabase,
  recordId: number,
  userId: string,
  record: NewHealthRecord,
): Promise<boolean> {
  const result = await database.runAsync(
    `UPDATE health_records
     SET metric = ?, name = ?, value = ?, unit = ?, recorded_at = ?, notes = ?
     WHERE id = ? AND user_id = ?`,
    record.metric,
    record.name,
    record.value,
    record.unit,
    record.recordedAt.toISOString(),
    record.notes,
    recordId,
    userId,
  );
  return result.changes === 1;
}

export async function deleteHealthRecord(
  database: SQLiteDatabase,
  recordId: number,
  userId: string,
): Promise<boolean> {
  const result = await database.runAsync(
    'DELETE FROM health_records WHERE id = ? AND user_id = ?',
    recordId,
    userId,
  );
  return result.changes === 1;
}

export async function getHealthRecords(
  database: SQLiteDatabase,
  userId: string,
  filters: HealthRecordFilters = {},
): Promise<HealthRecord[]> {
  const conditions = ['user_id = ?'];
  const parameters: (string | number)[] = [userId];

  if (filters.fromDate) {
    conditions.push('recorded_at >= ?');
    parameters.push(filters.fromDate);
  }

  const search = filters.search?.trim();
  if (search) {
    conditions.push('name LIKE ? COLLATE NOCASE');
    parameters.push(`%${search}%`);
  }

  const limitClause =
    filters.limit === undefined ? '' : ' LIMIT ?';
  if (filters.limit !== undefined) {
    parameters.push(Math.max(1, Math.floor(filters.limit)));
  }

  return database.getAllAsync<HealthRecord>(
    `SELECT id, metric, name, value, unit, recorded_at, notes
     FROM health_records
     WHERE ${conditions.join(' AND ')}
     ORDER BY recorded_at DESC, id DESC${limitClause}`,
    ...parameters,
  );
}

export async function getLatestHealthRecords(
  database: SQLiteDatabase,
  userId: string,
): Promise<HealthRecord[]> {
  return database.getAllAsync<HealthRecord>(
    `SELECT record.id, record.metric, record.name, record.value,
            record.unit, record.recorded_at, record.notes
     FROM health_records record
     WHERE record.user_id = ?
       AND NOT EXISTS (
         SELECT 1
         FROM health_records newer
         WHERE newer.user_id = record.user_id
           AND newer.metric = record.metric
           AND (
             newer.recorded_at > record.recorded_at
             OR (
               newer.recorded_at = record.recorded_at
               AND newer.id > record.id
             )
           )
       )
     ORDER BY record.recorded_at DESC, record.id DESC`,
    userId,
  );
}
