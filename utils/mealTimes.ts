export const MEAL_NAMES = ["Breakfast", "Lunch", "Dinner"] as const;

export type MealName = (typeof MEAL_NAMES)[number];
export type MealTiming = "Before" | "After";
export type MealTimes = Record<MealName, string>;

export const DEFAULT_MEAL_TIMES: MealTimes = {
  Breakfast: "07:00 AM",
  Lunch: "01:00 PM",
  Dinner: "07:00 PM",
};

export function formatTime(date: Date): string {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;

  return `${String(displayHours).padStart(2, "0")}:${minutes} ${period}`;
}

export function parseMealTime(value: string): Date | null {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value.trim());
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 1 || hour > 12 || minute > 59) return null;

  const period = match[3].toUpperCase();
  const date = new Date();
  date.setHours((hour % 12) + (period === "PM" ? 12 : 0), minute, 0, 0);
  return date;
}

export function calculateMealReminderTime(
  mealTime: string,
  timing: MealTiming,
  offsetMinutes: number,
): { time: string; dayOffset: number } | null {
  const parsedMealTime = parseMealTime(mealTime);
  if (
    !parsedMealTime ||
    !Number.isInteger(offsetMinutes) ||
    offsetMinutes < 0 ||
    offsetMinutes > 1440
  ) {
    return null;
  }

  const mealMinutes = parsedMealTime.getHours() * 60 + parsedMealTime.getMinutes();
  const reminderMinutes =
    mealMinutes + (timing === "Before" ? -offsetMinutes : offsetMinutes);
  const dayOffset = Math.floor(reminderMinutes / 1440);
  const minutesWithinDay = ((reminderMinutes % 1440) + 1440) % 1440;

  const reminderTime = new Date();
  reminderTime.setHours(
    Math.floor(minutesWithinDay / 60),
    minutesWithinDay % 60,
    0,
    0,
  );

  return { time: formatTime(reminderTime), dayOffset };
}
