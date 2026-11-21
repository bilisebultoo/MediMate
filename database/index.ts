import type { SQLiteDatabase } from "expo-sqlite";

export async function initializeDatabase(database: SQLiteDatabase) {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      gender TEXT,
      date_of_birth TEXT,
      role TEXT NOT NULL CHECK (role IN ('self', 'dependent')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS active_profile (
      singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
      profile_id TEXT NOT NULL,
      FOREIGN KEY (profile_id) REFERENCES profiles(id)
    );

    -- Medicines table
    CREATE TABLE IF NOT EXISTS medicines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'default',
      name TEXT NOT NULL,
      medicine_form TEXT NOT NULL,
      dose TEXT NOT NULL,
      frequency TEXT NOT NULL,
      schedule_method TEXT NOT NULL,
      meal TEXT,
      meal_timing TEXT,
      meal_offset_minutes INTEGER NOT NULL DEFAULT 30,
      fixed_times TEXT,
      interval_value TEXT,
      start_time TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT,
      instructions TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL
    );

    -- Medication History table
    CREATE TABLE IF NOT EXISTS medication_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'default',
      medicine_id INTEGER NOT NULL,
      scheduled_date TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'TAKEN', 'SKIPPED', 'MISSED')),
      taken_at TEXT,
      recorded_at TEXT,
      notes TEXT,
      FOREIGN KEY (medicine_id)
        REFERENCES medicines(id)
        ON DELETE CASCADE,
      UNIQUE (medicine_id, scheduled_date, scheduled_time)
    );

    -- Meal Settings table
    CREATE TABLE IF NOT EXISTS meal_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'default',
      breakfast_time TEXT NOT NULL DEFAULT '07:00 AM',
      lunch_time TEXT NOT NULL DEFAULT '01:00 PM',
      dinner_time TEXT NOT NULL DEFAULT '07:00 PM',
      updated_at TEXT NOT NULL,
      UNIQUE(user_id)
    );

    -- Health records table
    CREATE TABLE IF NOT EXISTS health_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'default',
      metric TEXT NOT NULL CHECK (
        metric IN (
          'blood_pressure', 'heart_rate', 'blood_sugar',
          'weight', 'temperature', 'custom'
        )
      ),
      name TEXT NOT NULL,
      value TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT '',
      recorded_at TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    -- Appointments table
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'default',
      title TEXT NOT NULL,
      scheduled_date TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      reminder_minutes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL
        CHECK (type IN ('doctor', 'facility', 'emergency')),
      name TEXT NOT NULL,
      specialty TEXT,
      relationship TEXT,
      phone TEXT NOT NULL,
      email TEXT,
      address TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id)
        REFERENCES profiles(id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS profile_settings (
      profile_id TEXT NOT NULL,
      setting_key TEXT NOT NULL,
      setting_value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (profile_id, setting_key),
      FOREIGN KEY (profile_id)
        REFERENCES profiles(id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS health_reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      metric TEXT NOT NULL
        CHECK (metric IN (
          'blood_pressure', 'heart_rate', 'blood_sugar',
          'weight', 'temperature', 'custom'
        )),
      label TEXT,
      start_date TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      repeat_type TEXT NOT NULL
        CHECK (repeat_type IN ('once', 'weekly')),
      repeat_days TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id)
        REFERENCES profiles(id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS weekly_health_reviews (
      profile_id TEXT NOT NULL,
      week_start TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      report_json TEXT NOT NULL,
      PRIMARY KEY (profile_id, week_start),
      FOREIGN KEY (profile_id)
        REFERENCES profiles(id)
        ON DELETE CASCADE
    );

    -- History indexes
    CREATE INDEX IF NOT EXISTS idx_medication_history_date
    ON medication_history(scheduled_date);

    CREATE INDEX IF NOT EXISTS idx_medication_history_medicine
    ON medication_history(medicine_id);

    CREATE INDEX IF NOT EXISTS idx_health_records_user_recorded
    ON health_records(user_id, recorded_at DESC);

    CREATE INDEX IF NOT EXISTS idx_appointments_user_date_time
    ON appointments(user_id, scheduled_date, scheduled_time);

    CREATE INDEX IF NOT EXISTS idx_contacts_user_type_name
    ON contacts(user_id, type, name COLLATE NOCASE);

    CREATE INDEX IF NOT EXISTS idx_health_reminders_user_enabled
    ON health_reminders(user_id, enabled, start_date);
  `);

  await database.runAsync(
    `INSERT OR IGNORE INTO profiles (id, name, role, created_at)
     VALUES (?, ?, 'self', ?)`,
    "default",
    "My Profile",
    new Date().toISOString(),
  );
  await database.runAsync(
    `INSERT OR IGNORE INTO active_profile (singleton_id, profile_id)
     VALUES (1, ?)`,
    "default",
  );

  // Add the column to databases that were created before meal offsets existed.
  const medicineColumns = await database.getAllAsync<{ name: string }>(
    "PRAGMA table_info(medicines)",
  );

  const hasMealOffsetColumn = medicineColumns.some(
    (column) => column.name === "meal_offset_minutes",
  );

  if (!hasMealOffsetColumn) {
    await database.execAsync(`
      ALTER TABLE medicines
      ADD COLUMN meal_offset_minutes INTEGER NOT NULL DEFAULT 30;
    `);
  }

  const appointmentColumns = await database.getAllAsync<{ name: string }>(
    "PRAGMA table_info(appointments)",
  );

  if (!appointmentColumns.some((column) => column.name === "reminder_minutes")) {
    await database.execAsync(`
      ALTER TABLE appointments
      ADD COLUMN reminder_minutes INTEGER NOT NULL DEFAULT 0;
    `);
  }

  const medicationHistorySchema = await database.getFirstAsync<{
    sql: string | null;
  }>(
    `SELECT sql FROM sqlite_master
     WHERE type = 'table' AND name = 'medication_history'`,
  );

  if (!medicationHistorySchema?.sql?.includes("'MISSED'")) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(`
        CREATE TABLE medication_history_replacement (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL DEFAULT 'default',
          medicine_id INTEGER NOT NULL,
          scheduled_date TEXT NOT NULL,
          scheduled_time TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING'
            CHECK (status IN ('PENDING', 'TAKEN', 'SKIPPED', 'MISSED')),
          taken_at TEXT,
          recorded_at TEXT,
          notes TEXT,
          FOREIGN KEY (medicine_id)
            REFERENCES medicines(id)
            ON DELETE CASCADE,
          UNIQUE (medicine_id, scheduled_date, scheduled_time)
        );

        INSERT INTO medication_history_replacement (
          id, user_id, medicine_id, scheduled_date, scheduled_time,
          status, taken_at, recorded_at, notes
        )
        SELECT
          id, user_id, medicine_id, scheduled_date, scheduled_time,
          status, taken_at, recorded_at, notes
        FROM medication_history;

        DROP TABLE medication_history;
        ALTER TABLE medication_history_replacement
        RENAME TO medication_history;

        CREATE INDEX idx_medication_history_date
        ON medication_history(scheduled_date);

        CREATE INDEX idx_medication_history_medicine
        ON medication_history(medicine_id);
      `);
    });
  }
}
