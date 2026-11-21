import type { SQLiteDatabase } from "expo-sqlite";

import type { HealthMetric } from "@/types/health";

type MedicationStatus = "PENDING" | "TAKEN" | "MISSED" | "SKIPPED";

type MedicationRow = {
  medicine_name: string;
  status: MedicationStatus;
};

type HealthRow = {
  metric: HealthMetric;
  name: string;
  value: string;
  unit: string;
  recorded_at: string;
};

type ReminderRow = {
  metric: HealthMetric;
  label: string | null;
  start_date: string;
  scheduled_time: string;
  repeat_type: "once" | "weekly";
  repeat_days: string;
};

type MedicineSummary = {
  name: string;
  scheduled: number;
  taken: number;
  missed: number;
  skipped: number;
  pending: number;
};

export type MeasurementSummary = {
  metric: HealthMetric;
  name: string;
  unit: string;
  count: number;
  earliestValue: string;
  earliestUnit: string;
  earliestAt: string;
  latestValue: string;
  latestAt: string;
};

export type WeeklyHealthReview = {
  version: 1;
  weekStart: string;
  generatedAt: string;
  assessment: "not_enough_information" | "needs_improvement" | "tracking_on_track";
  medication: {
    scheduled: number;
    taken: number;
    missed: number;
    skipped: number;
    pending: number;
    adherencePercent: number | null;
    byMedicine: MedicineSummary[];
  };
  health: {
    recordCount: number;
    measurements: MeasurementSummary[];
    remindersDue: number;
    remindersLogged: number;
  };
  observations: string[];
  recommendations: string[];
};

type StoredReviewRow = {
  report_json: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isMedicineSummary(value: unknown): value is MedicineSummary {
  if (!isRecord(value)) return false;
  return (
    typeof value.name === "string" &&
    isNonNegativeInteger(value.scheduled) &&
    isNonNegativeInteger(value.taken) &&
    isNonNegativeInteger(value.missed) &&
    isNonNegativeInteger(value.skipped) &&
    isNonNegativeInteger(value.pending)
  );
}

function isMeasurementSummary(value: unknown): value is MeasurementSummary {
  if (!isRecord(value)) return false;
  return (
    typeof value.metric === "string" &&
    typeof value.name === "string" &&
    typeof value.unit === "string" &&
    isNonNegativeInteger(value.count) &&
    typeof value.earliestValue === "string" &&
    typeof value.earliestUnit === "string" &&
    typeof value.earliestAt === "string" &&
    typeof value.latestValue === "string" &&
    typeof value.latestAt === "string"
  );
}

function isWeeklyHealthReview(value: unknown): value is WeeklyHealthReview {
  if (!isRecord(value) || !isRecord(value.medication) || !isRecord(value.health)) {
    return false;
  }

  const medication = value.medication;
  const health = value.health;
  return (
    value.version === 1 &&
    typeof value.weekStart === "string" &&
    typeof value.generatedAt === "string" &&
    (value.assessment === "not_enough_information" ||
      value.assessment === "needs_improvement" ||
      value.assessment === "tracking_on_track") &&
    isNonNegativeInteger(medication.scheduled) &&
    isNonNegativeInteger(medication.taken) &&
    isNonNegativeInteger(medication.missed) &&
    isNonNegativeInteger(medication.skipped) &&
    isNonNegativeInteger(medication.pending) &&
    (medication.adherencePercent === null ||
      (typeof medication.adherencePercent === "number" &&
        Number.isFinite(medication.adherencePercent))) &&
    Array.isArray(medication.byMedicine) &&
    medication.byMedicine.every(isMedicineSummary) &&
    isNonNegativeInteger(health.recordCount) &&
    Array.isArray(health.measurements) &&
    health.measurements.every(isMeasurementSummary) &&
    isNonNegativeInteger(health.remindersDue) &&
    isNonNegativeInteger(health.remindersLogged) &&
    Array.isArray(value.observations) &&
    value.observations.every((item) => typeof item === "string") &&
    Array.isArray(value.recommendations) &&
    value.recommendations.every((item) => typeof item === "string")
  );
}

function parseStoredReview(value: string): WeeklyHealthReview {
  const parsed: unknown = JSON.parse(value);
  if (!isWeeklyHealthReview(parsed)) {
    throw new Error("The saved weekly health review has an invalid format.");
  }
  return parsed;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekStart(now: Date): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function getMetricGroupKey(record: HealthRow): string {
  return record.metric === "custom"
    ? `${record.metric}:${record.name.trim().toLocaleLowerCase()}`
    : record.metric;
}

function summarizeMeasurements(records: HealthRow[]): MeasurementSummary[] {
  const chronological = [...records].sort(
    (first, second) =>
      new Date(first.recorded_at).getTime() -
      new Date(second.recorded_at).getTime(),
  );
  const groups = new Map<string, HealthRow[]>();

  for (const record of chronological) {
    const key = getMetricGroupKey(record);
    const group = groups.get(key);
    if (group) group.push(record);
    else groups.set(key, [record]);
  }

  return Array.from(groups.values()).map((group) => {
    const first = group[0];
    const latest = group[group.length - 1];
    return {
      metric: latest.metric,
      name: latest.name,
      unit: latest.unit,
      count: group.length,
      earliestValue: first.value,
      earliestUnit: first.unit,
      earliestAt: first.recorded_at,
      latestValue: latest.value,
      latestAt: latest.recorded_at,
    };
  });
}

function getValidRepeatDays(value: string, reminder: ReminderRow): Set<number> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (day) => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6,
      )
    ) {
      return new Set(
        parsed.filter(
          (day): day is number =>
            typeof day === "number" &&
            Number.isInteger(day) &&
            day >= 0 &&
            day <= 6,
        ),
      );
    }
  } catch (error) {
    console.error("Could not read health reminder days:", reminder, error);
    return new Set();
  }
  console.error("Health reminder has invalid repeat days:", reminder);
  return new Set();
}

function isValidReminderTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isReminderDueOnDate(
  reminder: ReminderRow,
  date: Date,
  now: Date,
  repeatDays: Set<number>,
): boolean {
  const dateKey = formatLocalDate(date);
  if (dateKey < reminder.start_date) return false;
  if (reminder.repeat_type === "once" && dateKey !== reminder.start_date) {
    return false;
  }
  if (reminder.repeat_type === "weekly" && !repeatDays.has(date.getDay())) {
    return false;
  }

  if (dateKey === formatLocalDate(now)) {
    const [hour, minute] = reminder.scheduled_time.split(":").map(Number);
    if (hour > now.getHours() || (hour === now.getHours() && minute > now.getMinutes())) {
      return false;
    }
  }
  return true;
}

function countDueReminderEntries(
  reminders: ReminderRow[],
  records: HealthRow[],
  weekStart: Date,
  now: Date,
): { due: number; logged: number } {
  const recordsByDayAndMetric = new Map<string, Set<string>>();
  for (const record of records) {
    const date = new Date(record.recorded_at);
    if (Number.isNaN(date.getTime())) continue;
    const key = `${record.metric}:${formatLocalDate(date)}`;
    const names = recordsByDayAndMetric.get(key) ?? new Set<string>();
    names.add(record.name.trim().toLocaleLowerCase());
    recordsByDayAndMetric.set(key, names);
  }

  let due = 0;
  let logged = 0;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  for (const reminder of reminders) {
    if (!isValidReminderTime(reminder.scheduled_time)) {
      console.error("Skipping health reminder with invalid time:", reminder);
      continue;
    }
    const repeatDays =
      reminder.repeat_type === "weekly"
        ? getValidRepeatDays(reminder.repeat_days, reminder)
        : new Set<number>();
    const cursor = new Date(weekStart);

    while (cursor <= today) {
      if (isReminderDueOnDate(reminder, cursor, now, repeatDays)) {
        due += 1;
        const key = `${reminder.metric}:${formatLocalDate(cursor)}`;
        const names = recordsByDayAndMetric.get(key);
        const hasMatchingEntry =
          reminder.metric !== "custom"
            ? Boolean(names?.size)
            : reminder.label?.trim()
              ? names?.has(reminder.label.trim().toLocaleLowerCase()) ?? false
              : Boolean(names?.size);
        if (hasMatchingEntry) logged += 1;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return { due, logged };
}

function buildReview(
  weekStart: Date,
  now: Date,
  medicationRows: MedicationRow[],
  healthRows: HealthRow[],
  reminders: ReminderRow[],
): WeeklyHealthReview {
  const medicineStats = new Map<string, MedicineSummary>();
  const medication = {
    scheduled: medicationRows.length,
    taken: 0,
    missed: 0,
    skipped: 0,
    pending: 0,
    adherencePercent: null as number | null,
    byMedicine: [] as MedicineSummary[],
  };

  for (const row of medicationRows) {
    const stats = medicineStats.get(row.medicine_name) ?? {
      name: row.medicine_name,
      scheduled: 0,
      taken: 0,
      missed: 0,
      skipped: 0,
      pending: 0,
    };
    stats.scheduled += 1;
    stats[row.status.toLocaleLowerCase() as "pending" | "taken" | "missed" | "skipped"] += 1;
    medicineStats.set(row.medicine_name, stats);
    medication[row.status.toLocaleLowerCase() as "pending" | "taken" | "missed" | "skipped"] += 1;
  }

  if (medication.scheduled > 0) {
    medication.adherencePercent = Math.round(
      (medication.taken / medication.scheduled) * 100,
    );
  }
  medication.byMedicine = Array.from(medicineStats.values()).sort(
    (first, second) => first.name.localeCompare(second.name),
  );

  const reminderSummary = countDueReminderEntries(
    reminders,
    healthRows,
    weekStart,
    now,
  );
  const measurements = summarizeMeasurements(healthRows);
  const hasInformation =
    medication.scheduled > 0 ||
    healthRows.length > 0 ||
    reminderSummary.due > 0;
  const needsFollowUp =
    medication.missed > 0 ||
    medication.skipped > 0 ||
    medication.pending > 0 ||
    reminderSummary.logged < reminderSummary.due;
  const assessment = !hasInformation
    ? "not_enough_information"
    : needsFollowUp
      ? "needs_improvement"
      : "tracking_on_track";

  const observations: string[] = [];
  if (medication.scheduled > 0) {
    observations.push(
      `${medication.taken} of ${medication.scheduled} scheduled doses were marked taken.`,
    );
  }
  if (medication.missed > 0) {
    observations.push(`${medication.missed} scheduled dose(s) were marked missed.`);
  }
  if (medication.skipped > 0) {
    observations.push(`${medication.skipped} scheduled dose(s) were marked skipped.`);
  }
  if (medication.pending > 0) {
    observations.push(
      `${medication.pending} due dose(s) do not yet have a recorded outcome.`,
    );
  }
  observations.push(
    `${healthRows.length} health measurement(s) were recorded this week.`,
  );
  if (reminderSummary.due > 0) {
    observations.push(
      `${reminderSummary.logged} of ${reminderSummary.due} scheduled health reminder(s) had a matching entry.`,
    );
  }

  const recommendations: string[] = [];
  if (medication.missed + medication.skipped > 0) {
    recommendations.push(
      "If taking a medicine as scheduled is difficult, discuss reminders or other options with your pharmacist or prescriber. Do not change a dose or take an extra dose based on this report.",
    );
  }
  if (medication.pending > 0) {
    recommendations.push(
      "Review doses with no recorded outcome and update your log if appropriate.",
    );
  }
  if (reminderSummary.logged < reminderSummary.due) {
    recommendations.push(
      "Some scheduled health-tracking reminders have no matching entry. Record a measurement when appropriate, or adjust reminders to fit your routine.",
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      "Continue recording information you and your healthcare professional have agreed to track.",
    );
  }
  recommendations.push(
    "Measurements are listed without medical interpretation. Follow your clinician's targets and care plan.",
  );

  return {
    version: 1,
    weekStart: formatLocalDate(weekStart),
    generatedAt: now.toISOString(),
    assessment,
    medication,
    health: {
      recordCount: healthRows.length,
      measurements,
      remindersDue: reminderSummary.due,
      remindersLogged: reminderSummary.logged,
    },
    observations,
    recommendations,
  };
}

export async function getWeeklyHealthReview(
  database: SQLiteDatabase,
  profileId: string,
  now: Date = new Date(),
): Promise<WeeklyHealthReview> {
  const weekStart = getWeekStart(now);
  const weekStartKey = formatLocalDate(weekStart);
  const saved = await database.getFirstAsync<StoredReviewRow>(
    `SELECT report_json
     FROM weekly_health_reviews
     WHERE profile_id = ? AND week_start = ?`,
    profileId,
    weekStartKey,
  );
  if (saved) return parseStoredReview(saved.report_json);

  const today = formatLocalDate(now);
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;
  const [medicationRows, healthRows, reminders] = await Promise.all([
    database.getAllAsync<MedicationRow>(
      `SELECT m.name AS medicine_name, h.status
       FROM medication_history h
       JOIN medicines m ON m.id = h.medicine_id
       WHERE h.user_id = ?
         AND h.scheduled_date >= ?
         AND h.scheduled_date <= ?
         AND (
           h.scheduled_date < ?
           OR (h.scheduled_date = ? AND h.scheduled_time <= ?)
         )
       ORDER BY h.scheduled_date, h.scheduled_time, h.id`,
      profileId,
      weekStartKey,
      today,
      today,
      today,
      currentTime,
    ),
    database.getAllAsync<HealthRow>(
      `SELECT metric, name, value, unit, recorded_at
       FROM health_records
       WHERE user_id = ? AND recorded_at >= ? AND recorded_at <= ?
       ORDER BY recorded_at, id`,
      profileId,
      weekStart.toISOString(),
      now.toISOString(),
    ),
    database.getAllAsync<ReminderRow>(
      `SELECT metric, label, start_date, scheduled_time, repeat_type, repeat_days
       FROM health_reminders
       WHERE user_id = ? AND enabled = 1`,
      profileId,
    ),
  ]);
  const review = buildReview(
    weekStart,
    now,
    medicationRows,
    healthRows,
    reminders,
  );

  await database.runAsync(
    `INSERT OR IGNORE INTO weekly_health_reviews (
      profile_id, week_start, generated_at, report_json
    ) VALUES (?, ?, ?, ?)`,
    profileId,
    weekStartKey,
    review.generatedAt,
    JSON.stringify(review),
  );

  const stored = await database.getFirstAsync<StoredReviewRow>(
    `SELECT report_json
     FROM weekly_health_reviews
     WHERE profile_id = ? AND week_start = ?`,
    profileId,
    weekStartKey,
  );
  if (!stored) {
    throw new Error("The weekly health review could not be saved.");
  }
  return parseStoredReview(stored.report_json);
}
