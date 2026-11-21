import type { SQLiteDatabase } from "expo-sqlite";

import {
  buildMedicationSchedulePlan,
  type MedicationScheduleInput,
} from "@/utils/medicationSchedule";
import {
  DEFAULT_MEAL_TIMES,
  type MealTimes,
} from "@/utils/mealTimes";
import { markExpiredMedicationDoses } from "@/services/medicationDoseStatus";

type MealSettingsRecord = {
  breakfast_time: string;
  lunch_time: string;
  dinner_time: string;
};

type MedicationSchedulePlan = ReturnType<typeof buildMedicationSchedulePlan>;

let generationQueue: Promise<number> = Promise.resolve(0);

export function generateMedicationSchedules(
  database: SQLiteDatabase,
  now: Date = new Date(),
): Promise<number> {
  const generation = generationQueue.then(
    () => performScheduleGeneration(database, now),
    () => performScheduleGeneration(database, now),
  );
  generationQueue = generation;
  return generation;
}

export function regeneratePendingMealSchedules(
  database: SQLiteDatabase,
  now: Date = new Date(),
): Promise<number> {
  const generation = generationQueue.then(
    () => performPendingMealScheduleRegeneration(database, now),
    () => performPendingMealScheduleRegeneration(database, now),
  );
  generationQueue = generation;
  return generation;
}

async function performScheduleGeneration(
  database: SQLiteDatabase,
  now: Date,
): Promise<number> {
  const medicines = await database.getAllAsync<MedicationScheduleInput>(
    `SELECT id, user_id, schedule_method, meal, meal_timing,
            meal_offset_minutes, fixed_times, start_date, end_date
     FROM medicines
     WHERE status = 'ACTIVE'
       AND schedule_method IN ('Meal-based', 'Fixed times')`,
  );

  if (medicines.length === 0) return 0;
  const plan = await buildPlansByUser(database, medicines, now);

  for (const medicineId of plan.invalidMedicineIds) {
    console.error(
      "Skipping schedule generation for invalid medicine schedule:",
      medicineId,
    );
  }

  return insertPendingDoseRows(database, plan.doses);
}

async function performPendingMealScheduleRegeneration(
  database: SQLiteDatabase,
  now: Date,
): Promise<number> {
  await markExpiredMedicationDoses(database, now);

  const medicines = await database.getAllAsync<MedicationScheduleInput>(
    `SELECT id, user_id, schedule_method, meal, meal_timing,
            meal_offset_minutes, fixed_times, start_date, end_date
     FROM medicines
     WHERE status = 'ACTIVE' AND schedule_method = 'Meal-based'`,
  );
  if (medicines.length === 0) return 0;
  const plan = await buildPlansByUser(database, medicines, now);

  for (const medicineId of plan.invalidMedicineIds) {
    console.error(
      "Skipping schedule regeneration for invalid meal schedule:",
      medicineId,
    );
  }

  const invalidMedicineIds = new Set(plan.invalidMedicineIds);
  const validMedicineIds = medicines
    .map((medicine) => medicine.id)
    .filter((medicineId) => !invalidMedicineIds.has(medicineId));
  if (validMedicineIds.length === 0) return 0;
  const validMedicineIdSet = new Set(validMedicineIds);

  const today = formatLocalDate(now);
  const currentTime = formatLocalTime(now);
  const gracePeriodRecords = await database.getAllAsync<{
    medicine_id: number;
  }>(
    `SELECT DISTINCT medicine_id
     FROM medication_history
     WHERE status = 'PENDING'
       AND scheduled_date = ?
       AND scheduled_time <= ?`,
    today,
    currentTime,
  );
  const gracePeriodMedicineIds = new Set(
    gracePeriodRecords.map((record) => record.medicine_id),
  );
  const futureDoses = plan.doses.filter(
    (dose) =>
      (dose.scheduledDate > today ||
        (dose.scheduledDate === today && dose.scheduledTime >= currentTime)) &&
      validMedicineIdSet.has(dose.medicineId) &&
      !(dose.scheduledDate === today && gracePeriodMedicineIds.has(dose.medicineId)),
  );

  let insertedCount = 0;
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      `DELETE FROM medication_history
       WHERE status = 'PENDING'
         AND medicine_id IN (${validMedicineIds.map(() => "?").join(", ")})
         AND (
           scheduled_date > ?
           OR (scheduled_date = ? AND scheduled_time > ?)
         )`,
      ...validMedicineIds,
      today,
      today,
      currentTime,
    );
    insertedCount = await insertPendingDoseRowsInTransaction(
      database,
      futureDoses,
    );
  });

  return insertedCount;
}

async function buildPlansByUser(
  database: SQLiteDatabase,
  medicines: MedicationScheduleInput[],
  now: Date,
): Promise<MedicationSchedulePlan> {
  const medicinesByUser = new Map<string, MedicationScheduleInput[]>();
  for (const medicine of medicines) {
    const userMedicines = medicinesByUser.get(medicine.user_id) ?? [];
    userMedicines.push(medicine);
    medicinesByUser.set(medicine.user_id, userMedicines);
  }

  const plans = await Promise.all(
    Array.from(medicinesByUser.entries()).map(async ([userId, userMedicines]) =>
      buildMedicationSchedulePlan(
        userMedicines,
        await getMealTimes(database, userId),
        now,
      ),
    ),
  );
  return {
    doses: plans.flatMap((plan) => plan.doses),
    invalidMedicineIds: plans.flatMap((plan) => plan.invalidMedicineIds),
  };
}

async function getMealTimes(
  database: SQLiteDatabase,
  userId: string,
): Promise<MealTimes> {
  const settings = await database.getFirstAsync<MealSettingsRecord>(
    `SELECT breakfast_time, lunch_time, dinner_time
     FROM meal_settings WHERE user_id = ?`,
    userId,
  );
  return settings
    ? {
        Breakfast: settings.breakfast_time,
        Lunch: settings.lunch_time,
        Dinner: settings.dinner_time,
      }
    : DEFAULT_MEAL_TIMES;
}

async function insertPendingDoseRows(
  database: SQLiteDatabase,
  doses: ReturnType<typeof buildMedicationSchedulePlan>["doses"],
): Promise<number> {
  if (doses.length === 0) return 0;

  let insertedCount = 0;
  await database.withTransactionAsync(async () => {
    insertedCount = await insertPendingDoseRowsInTransaction(database, doses);
  });

  return insertedCount;
}

async function insertPendingDoseRowsInTransaction(
  database: SQLiteDatabase,
  doses: ReturnType<typeof buildMedicationSchedulePlan>["doses"],
): Promise<number> {
  if (doses.length === 0) return 0;

  let insertedCount = 0;
  const statement = await database.prepareAsync(
    `INSERT INTO medication_history (
      user_id, medicine_id, scheduled_date, scheduled_time, status
    ) VALUES (?, ?, ?, ?, 'PENDING')
    ON CONFLICT(medicine_id, scheduled_date, scheduled_time) DO NOTHING`,
  );

  try {
    for (const dose of doses) {
      const result = await statement.executeAsync(
        dose.userId,
        dose.medicineId,
        dose.scheduledDate,
        dose.scheduledTime,
      );
      insertedCount += result.changes;
    }
  } finally {
    await statement.finalizeAsync();
  }

  return insertedCount;
}

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
