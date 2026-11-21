import {
  calculateMealReminderTime,
  DEFAULT_MEAL_TIMES,
  MEAL_NAMES,
  parseMealTime,
  type MealTimes,
} from "./mealTimes";

export const MEDICATION_SCHEDULE_DAYS = 30;

export type MedicationScheduleInput = {
  id: number;
  user_id: string;
  schedule_method: string;
  meal: string | null;
  meal_timing: string | null;
  meal_offset_minutes: number | null;
  fixed_times: string | null;
  start_date: string;
  end_date: string | null;
};

export type ScheduledDose = {
  userId: string;
  medicineId: number;
  scheduledDate: string;
  scheduledTime: string;
};

export type MedicationSchedulePlan = {
  doses: ScheduledDose[];
  invalidMedicineIds: number[];
};

function parseDateOnly(value: string | null): Date | null {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day, 12);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function addDays(date: Date, count: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + count);
  return result;
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatScheduledTime(date: Date): string {
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

export function buildMedicationSchedulePlan(
  medicines: MedicationScheduleInput[],
  savedMealTimes?: MealTimes | null,
  now: Date = new Date(),
): MedicationSchedulePlan {
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    12,
  );
  const horizonEnd = addDays(today, MEDICATION_SCHEDULE_DAYS - 1);
  const mealTimes = savedMealTimes ?? DEFAULT_MEAL_TIMES;
  const doses: ScheduledDose[] = [];
  const doseKeys = new Set<string>();
  const invalidMedicineIds = new Set<number>();

  function addDose(
    medicine: MedicationScheduleInput,
    scheduledDate: Date,
    scheduledTime: Date,
    firstDate: Date,
    lastDate: Date,
  ) {
    const dateKey = formatDateOnly(scheduledDate);
    if (
      dateKey < formatDateOnly(firstDate) ||
      dateKey > formatDateOnly(lastDate)
    ) {
      return;
    }

    const timeKey = formatScheduledTime(scheduledTime);
    const uniqueKey = `${medicine.id}:${dateKey}:${timeKey}`;
    if (doseKeys.has(uniqueKey)) return;

    doseKeys.add(uniqueKey);
    doses.push({
      userId: medicine.user_id,
      medicineId: medicine.id,
      scheduledDate: dateKey,
      scheduledTime: timeKey,
    });
  }

  for (const medicine of medicines) {
    const startDate = parseDateOnly(medicine.start_date);
    const endDate = medicine.end_date
      ? parseDateOnly(medicine.end_date)
      : null;

    if (!startDate || (medicine.end_date && !endDate)) {
      invalidMedicineIds.add(medicine.id);
      continue;
    }

    const firstDate = startDate > today ? startDate : today;
    const lastDate = endDate && endDate < horizonEnd ? endDate : horizonEnd;
    if (firstDate > lastDate) continue;

    if (medicine.schedule_method === "Fixed times") {
      const fixedTimes = medicine.fixed_times
        ?.split(",")
        .map((time) => time.trim())
        .filter(Boolean);

      if (!fixedTimes?.length) {
        invalidMedicineIds.add(medicine.id);
        continue;
      }

      const uniqueTimes = new Map<string, Date>();
      let hasInvalidTime = false;
      for (const fixedTime of fixedTimes) {
        const parsedTime = parseMealTime(fixedTime);
        if (!parsedTime) {
          hasInvalidTime = true;
          break;
        }
        uniqueTimes.set(formatScheduledTime(parsedTime), parsedTime);
      }

      if (hasInvalidTime) {
        invalidMedicineIds.add(medicine.id);
        continue;
      }

      for (
        let scheduledDate = firstDate;
        scheduledDate <= lastDate;
        scheduledDate = addDays(scheduledDate, 1)
      ) {
        for (const scheduledTime of uniqueTimes.values()) {
          addDose(
            medicine,
            scheduledDate,
            scheduledTime,
            firstDate,
            lastDate,
          );
        }
      }
      continue;
    }

    if (medicine.schedule_method !== "Meal-based") continue;

    const meal = MEAL_NAMES.find((name) => name === medicine.meal);
    if (!meal) {
      invalidMedicineIds.add(medicine.id);
      continue;
    }

    const timing = medicine.meal_timing === "After" ? "After" : "Before";
    const reminderTime = calculateMealReminderTime(
      mealTimes[meal],
      timing,
      medicine.meal_offset_minutes ?? 30,
    );
    const scheduledTime = reminderTime
      ? parseMealTime(reminderTime.time)
      : null;

    if (!reminderTime || !scheduledTime) {
      invalidMedicineIds.add(medicine.id);
      continue;
    }

    for (
      let mealDate = addDays(firstDate, -1);
      mealDate <= addDays(lastDate, 1);
      mealDate = addDays(mealDate, 1)
    ) {
      const scheduledDate = addDays(mealDate, reminderTime.dayOffset);
      scheduledDate.setHours(
        scheduledTime.getHours(),
        scheduledTime.getMinutes(),
        0,
        0,
      );
      addDose(
        medicine,
        scheduledDate,
        scheduledTime,
        firstDate,
        lastDate,
      );
    }
  }

  doses.sort(
    (first, second) =>
      first.scheduledDate.localeCompare(second.scheduledDate) ||
      first.scheduledTime.localeCompare(second.scheduledTime) ||
      first.medicineId - second.medicineId,
  );

  return { doses, invalidMedicineIds: [...invalidMedicineIds] };
}
