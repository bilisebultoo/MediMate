import { Platform } from "react-native";
import type { SQLiteDatabase } from "expo-sqlite";
import * as Notifications from "expo-notifications";

import type { HealthMetric } from "@/types/health";

export type MedicationStatus = "PENDING" | "TAKEN" | "MISSED" | "SKIPPED";

export type MedicationRow = {
  medicine_name: string;
  status: MedicationStatus;
  scheduled_date: string;
  scheduled_time: string;
};

export type HealthRow = {
  metric: HealthMetric;
  name: string;
  value: string;
  unit: string;
  recorded_at: string;
};

export type ReminderRow = {
  metric: HealthMetric;
  label: string | null;
  start_date: string;
  scheduled_time: string;
  repeat_type: "once" | "weekly";
  repeat_days: string;
};

export type MedicineSummary = {
  name: string;
  scheduled: number;
  taken: number;
  missed: number;
  skipped: number;
  pending: number;
};

export type HealthTrendDirection =
  | "rising"
  | "falling"
  | "stable"
  | "variable"
  | "insufficient_data";

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
  trend?: HealthTrendDirection;
  trendLabel?: string;
  readings?: { value: string; unit: string; recordedAt: string }[];
  referenceGuidance?: string;
  clinicalNote?: string;
  isSufficientData?: boolean;
};

export type AssessmentStatus =
  | "normal"
  | "needs_improvement"
  | "urgent_attention"
  | "not_enough_information"
  | "tracking_on_track"; // For backwards compatibility

export type MealRecommendation = {
  title: string;
  category: "blood_pressure" | "blood_sugar" | "heart_health" | "general_nutrition";
  recommendedFoods: string[];
  foodsToDiscuss: string[];
  rationale: string;
  scientificSource: string;
  sourceUrl?: string;
};

export type ActivityRecommendation = {
  title: string;
  intensity: "low" | "moderate";
  suggestedActivities: string[];
  rationale: string;
  precautions: string;
  scientificSource: string;
  sourceUrl?: string;
};

export type AttentionItem = {
  severity: "urgent" | "warning" | "info";
  title: string;
  description: string;
  action: string;
};

export type ProgressComparison = {
  previousWeekAdherence: number | null;
  adherenceDiff: number | null;
  previousWeekScheduled: number;
  previousWeekTaken: number;
  previousWeekMissed: number;
  previousWeekRecordsCount: number;
  recordsCountDiff: number;
  summaryText: string;
};

export type WeeklyHealthReview = {
  version: 1 | 2;
  weekStart: string;
  weekEnd?: string;
  generatedAt: string;
  assessment: AssessmentStatus;
  assessmentReason?: string;
  urgentWarning?: string | null;
  medication: {
    scheduled: number;
    taken: number;
    missed: number;
    skipped: number;
    pending: number;
    adherencePercent: number | null;
    byMedicine: MedicineSummary[];
    missedPatterns?: string[];
  };
  health: {
    recordCount: number;
    measurements: MeasurementSummary[];
    remindersDue: number;
    remindersLogged: number;
  };
  progress?: ProgressComparison;
  mealRecommendations?: MealRecommendation[];
  activityRecommendations?: ActivityRecommendation[];
  attentionItems?: AttentionItem[];
  nextSteps?: string[];
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
    (value.version === 1 || value.version === 2) &&
    typeof value.weekStart === "string" &&
    typeof value.generatedAt === "string" &&
    (value.assessment === "not_enough_information" ||
      value.assessment === "needs_improvement" ||
      value.assessment === "normal" ||
      value.assessment === "urgent_attention" ||
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
  // Ensure default arrays if loading an older version
  if (!parsed.mealRecommendations) {
    parsed.mealRecommendations = buildMealRecommendations(parsed.health.measurements);
  }
  if (!parsed.activityRecommendations) {
    parsed.activityRecommendations = buildActivityRecommendations(parsed.health.measurements);
  }
  if (!parsed.nextSteps) {
    parsed.nextSteps = buildNextSteps(parsed.medication, parsed.health.recordCount);
  }
  if (!parsed.attentionItems) {
    parsed.attentionItems = buildAttentionItems(
      parsed.medication,
      parsed.health.remindersDue,
      parsed.health.remindersLogged,
      parsed.urgentWarning || null,
    );
  }
  return parsed;
}

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getWeekStart(now: Date): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  start.setDate(start.getDate() - ((day + 6) % 7));
  return start;
}

export function getWeekEnd(weekStart: Date): Date {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function getMetricGroupKey(record: HealthRow): string {
  return record.metric === "custom"
    ? `${record.metric}:${record.name.trim().toLocaleLowerCase()}`
    : record.metric;
}

function computeMetricTrend(
  metric: HealthMetric,
  records: HealthRow[],
): {
  trend: HealthTrendDirection;
  trendLabel: string;
  referenceGuidance: string;
  isSufficientData: boolean;
} {
  const count = records.length;
  const isSufficientData = count >= 3;

  let referenceGuidance = "";
  switch (metric) {
    case "blood_pressure":
      referenceGuidance =
        "AHA/ACC 2017 Clinical Reference: Normal resting BP is < 120/< 80 mmHg. Elevated is 120–129/< 80 mmHg; Stage 1 hypertension is 130–139/80–89 mmHg. Clinical interpretation depends on age, resting state, and individual care plans.";
      break;
    case "heart_rate":
      referenceGuidance =
        "AHA Reference: Typical adult resting heart rate is 60–100 bpm. Heart rate varies with physical activity, hydration, anxiety, and medications (e.g. beta blockers).";
      break;
    case "blood_sugar":
      referenceGuidance =
        "ADA Standards of Care: General target for adults with diabetes is 80–130 mg/dL fasting, and < 180 mg/dL 1–2 hours after meals. Individual targets vary based on physician advice.";
      break;
    case "temperature":
      referenceGuidance =
        "Clinical Reference: Normal oral body temperature averages ~98.6°F (37.0°C), typically varying between 97.8°F and 99.0°F. Fever is defined as ≥ 100.4°F (38.0°C).";
      break;
    case "weight":
      referenceGuidance =
        "Clinical Guidance: Day-to-day weight fluctuations can reflect fluid shifts. Unexplained sudden changes should be discussed with your physician.";
      break;
    default:
      referenceGuidance =
        "Measurements are listed as recorded. Please consult your clinician to establish individualized target ranges.";
      break;
  }

  if (count <= 1) {
    return {
      trend: "insufficient_data",
      trendLabel: count === 1 ? "Single recorded reading" : "No readings recorded",
      referenceGuidance,
      isSufficientData: false,
    };
  }

  // Calculate numeric trend
  const first = records[0];
  const latest = records[records.length - 1];

  let firstNum = NaN;
  let latestNum = NaN;

  if (metric === "blood_pressure") {
    const p1 = first.value.split("/").map((v) => Number(v.trim()));
    const p2 = latest.value.split("/").map((v) => Number(v.trim()));
    if (p1.length === 2 && p2.length === 2 && !isNaN(p1[0]) && !isNaN(p2[0])) {
      firstNum = p1[0];
      latestNum = p2[0];
    }
  } else {
    firstNum = parseFloat(first.value);
    latestNum = parseFloat(latest.value);
  }

  if (isNaN(firstNum) || isNaN(latestNum)) {
    return {
      trend: "variable",
      trendLabel: "Variable weekly entries",
      referenceGuidance,
      isSufficientData,
    };
  }

  const diff = latestNum - firstNum;
  const percentChange = firstNum !== 0 ? (diff / firstNum) * 100 : 0;

  if (Math.abs(percentChange) < 3.0) {
    return {
      trend: "stable",
      trendLabel: "Stable across the week",
      referenceGuidance,
      isSufficientData,
    };
  } else if (diff > 0) {
    return {
      trend: "rising",
      trendLabel: "Trend is trending upward",
      referenceGuidance,
      isSufficientData,
    };
  } else {
    return {
      trend: "falling",
      trendLabel: "Trend is trending downward",
      referenceGuidance,
      isSufficientData,
    };
  }
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
    const { trend, trendLabel, referenceGuidance, isSufficientData } =
      computeMetricTrend(latest.metric, group);

    const readings = group.map((r) => ({
      value: r.value,
      unit: r.unit,
      recordedAt: r.recorded_at,
    }));

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
      trend,
      trendLabel,
      readings,
      referenceGuidance,
      isSufficientData,
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

function checkUrgentWarningRules(healthRows: HealthRow[]): string | null {
  for (const m of healthRows) {
    if (m.metric === "blood_pressure") {
      const parts = m.value.split("/").map((v) => Number(v.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        if (parts[0] >= 180 || parts[1] >= 120) {
          return `Blood pressure recorded at ${m.value} mmHg meets hypertensive crisis threshold (≥ 180/120 mmHg). Please seek immediate urgent medical evaluation.`;
        }
      }
    } else if (m.metric === "heart_rate") {
      const hr = Number(m.value.trim());
      if (!isNaN(hr)) {
        if (hr > 130) {
          return `Resting heart rate of ${hr} bpm is unusually elevated. If accompanied by chest tightness, shortness of breath, or dizziness, seek urgent medical care.`;
        } else if (hr < 40 && hr > 0) {
          return `Resting heart rate of ${hr} bpm is unusually low. Please consult a healthcare professional.`;
        }
      }
    } else if (m.metric === "blood_sugar") {
      const bs = Number(m.value.trim());
      if (!isNaN(bs)) {
        if (bs < 54 && bs > 0) {
          return `Blood glucose reading of ${bs} ${m.unit || "mg/dL"} indicates severe hypoglycemia. Take fast-acting carbohydrates immediately and seek emergency medical guidance if symptoms persist.`;
        }
      }
    } else if (m.metric === "temperature") {
      const temp = Number(m.value.trim());
      if (!isNaN(temp)) {
        if (temp >= 104 || (m.unit.toLowerCase().includes("c") && temp >= 40)) {
          return `High fever recorded at ${m.value} ${m.unit}. Seek prompt medical evaluation.`;
        }
      }
    }
  }
  return null;
}

function findMissedDosePatterns(medicationRows: MedicationRow[]): string[] {
  const missedRows = medicationRows.filter((r) => r.status === "MISSED");
  if (missedRows.length === 0) return [];

  const byMedicine = new Map<string, number>();
  const byTimeOfDay = { morning: 0, afternoon: 0, evening: 0, night: 0 };

  for (const row of missedRows) {
    byMedicine.set(row.medicine_name, (byMedicine.get(row.medicine_name) || 0) + 1);
    const hour = parseInt(row.scheduled_time.split(":")[0], 10);
    if (!isNaN(hour)) {
      if (hour >= 5 && hour < 12) byTimeOfDay.morning += 1;
      else if (hour >= 12 && hour < 17) byTimeOfDay.afternoon += 1;
      else if (hour >= 17 && hour < 21) byTimeOfDay.evening += 1;
      else byTimeOfDay.night += 1;
    }
  }

  const patterns: string[] = [];
  for (const [medName, count] of byMedicine.entries()) {
    if (count >= 2) {
      patterns.push(`${medName} had ${count} missed doses this week.`);
    }
  }

  const timeEntries = Object.entries(byTimeOfDay).sort((a, b) => b[1] - a[1]);
  if (timeEntries[0][1] >= 2) {
    patterns.push(
      `Most missed doses (${timeEntries[0][1]}) occurred during ${timeEntries[0][0]} hours. Consider adjusting reminders to better align with your routine.`,
    );
  }

  return patterns;
}

export function buildMealRecommendations(
  measurements: MeasurementSummary[],
): MealRecommendation[] {
  const recommendations: MealRecommendation[] = [];
  const metricsLogged = new Set(measurements.map((m) => m.metric));

  if (metricsLogged.has("blood_pressure")) {
    recommendations.push({
      title: "DASH-Aligned Heart & Vascular Nutrition",
      category: "blood_pressure",
      recommendedFoods: [
        "Dark leafy greens (spinach, kale)",
        "Potassium-rich fruits (bananas, berries, oranges)",
        "Sweet potatoes & avocados",
        "Unsalted almonds & walnuts",
        "Legumes (black beans, chickpeas)",
      ],
      foodsToDiscuss: [
        "High-sodium cured meats and cold cuts",
        "Canned soups and broths with added sodium",
        "Heavily processed salty snack foods",
      ],
      rationale:
        "The DASH dietary pattern emphasizes natural sources of potassium, calcium, and magnesium, which promote vascular elasticity and fluid balance.",
      scientificSource: "National Heart, Lung, and Blood Institute (NHLBI) DASH Eating Plan",
      sourceUrl: "https://www.nhlbi.nih.gov/health/dash-eating-plan",
    });
  }

  if (metricsLogged.has("blood_sugar")) {
    recommendations.push({
      title: "Glycemic Stability & High-Fiber Balance",
      category: "blood_sugar",
      recommendedFoods: [
        "Non-starchy vegetables (broccoli, bell peppers, zucchini)",
        "Intact whole grains (steel-cut oats, quinoa, barley)",
        "Plant proteins & legumes (lentils, edamame)",
        "Healthy protein pairings (Greek yogurt, eggs, wild fish)",
      ],
      foodsToDiscuss: [
        "Sugar-sweetened beverages and concentrated fruit juices",
        "Refined white flour products (bagels, white pasta)",
        "Single-source carbohydrate snacks without protein or healthy fat",
      ],
      rationale:
        "Pairing high-fiber complex carbohydrates with lean protein delays carbohydrate absorption and buffers rapid post-meal glucose spikes.",
      scientificSource: "American Diabetes Association (ADA) Standards of Care in Diabetes",
      sourceUrl: "https://diabetes.org/food-nutrition",
    });
  }

  if (metricsLogged.has("heart_rate")) {
    recommendations.push({
      title: "Cardiovascular & Endothelial Nutrient Support",
      category: "heart_health",
      recommendedFoods: [
        "Omega-3 fatty acid rich seafood (wild salmon, sardines, mackerel)",
        "Flaxseeds and chia seeds",
        "Extra virgin olive oil as primary culinary oil",
        "Antioxidant-dense berries (blueberries, blackberries)",
      ],
      foodsToDiscuss: [
        "Excessive caffeine and high-stimulant energy drinks",
        "Trans-fats and deep-fried fast foods",
      ],
      rationale:
        "Omega-3 polyunsaturated fats and plant polyphenols support vascular endothelial health and calm systemic inflammatory pathways.",
      scientificSource: "American Heart Association (AHA) Dietary Guidance",
      sourceUrl: "https://www.heart.org/en/healthy-living/healthy-eating",
    });
  }

  // Always include foundational hydration and nutrition
  recommendations.push({
    title: "Daily Hydration & Diverse Whole Foods",
    category: "general_nutrition",
    recommendedFoods: [
      "Consistent plain water intake (6–8 glasses daily, unless restricted by your doctor)",
      "Vibrantly colored fresh vegetables with every meal",
      "Fresh whole fruit with peel intact where edible",
    ],
    foodsToDiscuss: [
      "Excessive alcohol consumption",
      "Sugary coffee and soda beverages",
    ],
    rationale:
      "Adequate hydration preserves circulatory volume, supports kidney filtration of medications, and assists healthy metabolic rate.",
    scientificSource: "World Health Organization (WHO) Healthy Diet Guidelines",
    sourceUrl: "https://www.who.int/news-room/fact-sheets/detail/healthy-diet",
  });

  return recommendations;
}

export function buildActivityRecommendations(
  measurements: MeasurementSummary[],
): ActivityRecommendation[] {
  const recommendations: ActivityRecommendation[] = [];
  const metricsLogged = new Set(measurements.map((m) => m.metric));

  recommendations.push({
    title: "Safe Moderate Aerobic Movement",
    intensity: "moderate",
    suggestedActivities: [
      "Brisk walking at a comfortable conversational pace (15–30 minutes)",
      "Stationary or recumbent indoor cycling",
      "Gentle water aerobics or lap swimming",
    ],
    rationale:
      "Regular moderate-intensity aerobic exercise enhances cardiac muscle efficiency, improves insulin sensitivity, and lowers resting blood pressure over time.",
    precautions:
      "Begin with a 5-minute warm-up. If you experience unexpected shortness of breath, dizziness, or chest discomfort, stop and seek medical assessment.",
    scientificSource: "WHO Guidelines on Physical Activity and Sedentary Behaviour",
    sourceUrl: "https://www.who.int/news-room/fact-sheets/detail/physical-activity",
  });

  recommendations.push({
    title: "Low-Impact Flexibility & Functional Strength",
    intensity: "low",
    suggestedActivities: [
      "Seated posture stretches and shoulder rolls",
      "Gentle chair squats and supported calf raises",
      "Light resistance band rows and bicep flexes",
      "Gentle restorative yoga or tai chi",
    ],
    rationale:
      "Preserving joint range of motion and functional muscle mass supports balance, prevents falls, and reduces daily musculoskeletal stiffness.",
    precautions:
      "Avoid holding your breath (Valsalva maneuver) when exerting force. Move through smooth, pain-free ranges of motion.",
    scientificSource: "CDC Physical Activity Guidelines for Adults",
    sourceUrl: "https://www.cdc.gov/physicalactivity/basics/adults/index.htm",
  });

  return recommendations;
}

export function buildAttentionItems(
  medication: {
    scheduled: number;
    taken: number;
    missed: number;
    skipped: number;
    pending: number;
  },
  remindersDue: number,
  remindersLogged: number,
  urgentWarning: string | null,
): AttentionItem[] {
  const items: AttentionItem[] = [];

  if (urgentWarning) {
    items.push({
      severity: "urgent",
      title: "Urgent Medical Alert",
      description: urgentWarning,
      action: "Seek immediate medical evaluation or contact emergency care services.",
    });
  }

  if (medication.missed > 0) {
    items.push({
      severity: "warning",
      title: `${medication.missed} Missed Dose(s) Recorded`,
      description:
        "Consistent medication taking ensures steady drug therapeutic levels. Missed doses reduce treatment efficacy.",
      action:
        "Review your daily reminder routine and consult your pharmacist or prescriber for personalized guidance. Do not take double doses.",
    });
  }

  if (medication.pending > 0) {
    items.push({
      severity: "info",
      title: `${medication.pending} Due Dose(s) Pending Confirmation`,
      description:
        "These doses were scheduled for earlier in the week but were not marked taken or missed.",
      action: "Update your medication schedule log on Home to keep your weekly adherence records accurate.",
    });
  }

  if (remindersDue > 0 && remindersLogged < remindersDue) {
    items.push({
      severity: "info",
      title: "Incomplete Health Measurement Reminders",
      description: `${remindersDue - remindersLogged} of ${remindersDue} scheduled measurement reminders were not logged this week.`,
      action:
        "Try logging measurements at consistent times (e.g. morning before breakfast) to establish meaningful health trends.",
    });
  }

  return items;
}

export function buildNextSteps(
  medication: { missed: number; skipped: number; pending: number; scheduled: number },
  healthRecordCount: number,
): string[] {
  const steps: string[] = [];

  if (medication.missed > 0 || medication.pending > 0) {
    steps.push(
      "Align medication times with daily habits (e.g. keeping your pill organizer by your morning breakfast station).",
    );
  }

  if (healthRecordCount < 3) {
    steps.push(
      "Aim to log at least 2 to 3 health measurements next week to build reliable trend data for your clinician.",
    );
  } else {
    steps.push(
      "Continue consistent health logging. Bring these weekly trend records to your next appointment.",
    );
  }

  steps.push(
    "Stay hydrated with adequate water intake and incorporate nutrient-rich whole foods into your meals.",
  );
  steps.push(
    "Engage in regular low-to-moderate physical movement (such as daily 20-minute walks) per your physician's advice.",
  );

  return steps;
}

function buildReview(
  weekStart: Date,
  now: Date,
  medicationRows: MedicationRow[],
  healthRows: HealthRow[],
  reminders: ReminderRow[],
  previousMedicationRows: MedicationRow[],
  previousHealthRows: HealthRow[],
): WeeklyHealthReview {
  const weekEnd = getWeekEnd(weekStart);
  const medicineStats = new Map<string, MedicineSummary>();
  const medication = {
    scheduled: medicationRows.length,
    taken: 0,
    missed: 0,
    skipped: 0,
    pending: 0,
    adherencePercent: null as number | null,
    byMedicine: [] as MedicineSummary[],
    missedPatterns: [] as string[],
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
  medication.missedPatterns = findMissedDosePatterns(medicationRows);

  const reminderSummary = countDueReminderEntries(
    reminders,
    healthRows,
    weekStart,
    now,
  );
  const measurements = summarizeMeasurements(healthRows);
  const urgentWarning = checkUrgentWarningRules(healthRows);

  const hasInformation =
    medication.scheduled > 0 ||
    healthRows.length > 0 ||
    reminderSummary.due > 0;

  let assessment: AssessmentStatus = "not_enough_information";
  let assessmentReason = "";

  if (urgentWarning) {
    assessment = "urgent_attention";
    assessmentReason = urgentWarning;
  } else if (!hasInformation) {
    assessment = "not_enough_information";
    assessmentReason =
      "There are not enough recorded doses or health measurements to assess this week.";
  } else if (
    medication.missed >= 2 ||
    (medication.scheduled > 0 && (medication.adherencePercent ?? 100) < 80) ||
    (reminderSummary.due > 0 && reminderSummary.logged < Math.ceil(reminderSummary.due * 0.7))
  ) {
    assessment = "needs_improvement";
    assessmentReason =
      "Multiple missed doses or incomplete tracking entries were noted this week.";
  } else {
    assessment = "normal";
    assessmentReason =
      "Available records show consistent medication logging and regular health check-ins.";
  }

  // Previous week comparison calculations
  let prevAdherence: number | null = null;
  if (previousMedicationRows.length > 0) {
    const prevTaken = previousMedicationRows.filter((r) => r.status === "TAKEN").length;
    prevAdherence = Math.round((prevTaken / previousMedicationRows.length) * 100);
  }

  const adherenceDiff =
    medication.adherencePercent !== null && prevAdherence !== null
      ? medication.adherencePercent - prevAdherence
      : null;

  const recordsCountDiff = healthRows.length - previousHealthRows.length;
  let summaryText = "";
  if (adherenceDiff !== null) {
    if (adherenceDiff > 0) {
      summaryText = `Medication adherence increased by +${adherenceDiff}% compared to last week.`;
    } else if (adherenceDiff < 0) {
      summaryText = `Medication adherence dropped by ${Math.abs(adherenceDiff)}% compared to last week.`;
    } else {
      summaryText = "Medication adherence remained steady compared to last week.";
    }
  } else if (medication.scheduled > 0) {
    summaryText = "Baseline week established. Ongoing consistency will unlock trend comparisons.";
  } else {
    summaryText = "Log your medication doses and measurements to track weekly progress.";
  }

  const progress: ProgressComparison = {
    previousWeekAdherence: prevAdherence,
    adherenceDiff,
    previousWeekScheduled: previousMedicationRows.length,
    previousWeekTaken: previousMedicationRows.filter((r) => r.status === "TAKEN").length,
    previousWeekMissed: previousMedicationRows.filter((r) => r.status === "MISSED").length,
    previousWeekRecordsCount: previousHealthRows.length,
    recordsCountDiff,
    summaryText,
  };

  const observations: string[] = [];
  if (medication.scheduled > 0) {
    observations.push(
      `${medication.taken} of ${medication.scheduled} scheduled doses were marked taken (${medication.adherencePercent}% adherence).`,
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

  const mealRecommendations = buildMealRecommendations(measurements);
  const activityRecommendations = buildActivityRecommendations(measurements);
  const attentionItems = buildAttentionItems(
    medication,
    reminderSummary.due,
    reminderSummary.logged,
    urgentWarning,
  );
  const nextSteps = buildNextSteps(medication, healthRows.length);

  return {
    version: 2,
    weekStart: formatLocalDate(weekStart),
    weekEnd: formatLocalDate(weekEnd),
    generatedAt: now.toISOString(),
    assessment,
    assessmentReason,
    urgentWarning,
    medication,
    health: {
      recordCount: healthRows.length,
      measurements,
      remindersDue: reminderSummary.due,
      remindersLogged: reminderSummary.logged,
    },
    progress,
    mealRecommendations,
    activityRecommendations,
    attentionItems,
    nextSteps,
    observations,
    recommendations,
  };
}

export async function scheduleWeeklyReviewNotification(
  profileId: string,
  profileName: string = "your profile",
): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const status = await Notifications.getPermissionsAsync();
    const isGranted =
      status.status === "granted" ||
      status.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED ||
      status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!isGranted) return;

    const all = await Notifications.getAllScheduledNotificationsAsync();
    const hasWeeklyNotification = all.some(
      (n) =>
        n.content.data?.kind === "weekly-health-review" &&
        n.content.data?.profileId === profileId,
    );
    if (hasWeeklyNotification) return;

    // Calculate upcoming Sunday at 9:00 AM
    const nextSunday = new Date();
    const day = nextSunday.getDay();
    const daysUntilSunday = (7 - day) % 7 || 7;
    nextSunday.setDate(nextSunday.getDate() + daysUntilSunday);
    nextSunday.setHours(9, 0, 0, 0);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "MediMate Weekly Health Review",
        body: `Your HowWasYou weekly check-in for ${profileName} is ready! Review your consistency and health trends.`,
        sound: "default",
        data: {
          kind: "weekly-health-review",
          profileId,
          url: "/ai/how-was-you",
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: nextSunday,
      },
    });
  } catch (error) {
    console.warn("Could not schedule weekly health review notification:", error);
  }
}

export async function getAvailableReviewWeeks(
  database: SQLiteDatabase,
  profileId: string,
): Promise<{ weekStart: string; label: string }[]> {
  const reviews = await database.getAllAsync<{ week_start: string }>(
    `SELECT DISTINCT week_start
     FROM weekly_health_reviews
     WHERE profile_id = ?
     ORDER BY week_start DESC
     LIMIT 12`,
    profileId,
  );

  const now = new Date();
  const currentWeekStart = formatLocalDate(getWeekStart(now));
  const weeksSet = new Set<string>();
  weeksSet.add(currentWeekStart);

  for (const r of reviews) {
    weeksSet.add(r.week_start);
  }

  // Also include 1 and 2 weeks prior if not already there
  for (let i = 1; i <= 3; i++) {
    const past = new Date(now);
    past.setDate(past.getDate() - i * 7);
    weeksSet.add(formatLocalDate(getWeekStart(past)));
  }

  const sorted = Array.from(weeksSet).sort((a, b) => b.localeCompare(a));
  return sorted.map((weekStart) => {
    const d = new Date(weekStart + "T00:00:00");
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    const startStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const endStr = end.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const label =
      weekStart === currentWeekStart
        ? `This Week (${startStr} – ${endStr})`
        : `${startStr} – ${endStr}`;
    return { weekStart, label };
  });
}

export async function getWeeklyHealthReview(
  database: SQLiteDatabase,
  profileId: string,
  nowOrWeekStart?: Date | string,
  forceRefresh: boolean = false,
): Promise<WeeklyHealthReview> {
  const now = new Date();
  let weekStart: Date;

  if (typeof nowOrWeekStart === "string") {
    weekStart = new Date(nowOrWeekStart + "T00:00:00");
  } else if (nowOrWeekStart instanceof Date) {
    weekStart = getWeekStart(nowOrWeekStart);
  } else {
    weekStart = getWeekStart(now);
  }

  const weekStartKey = formatLocalDate(weekStart);
  const weekEnd = getWeekEnd(weekStart);
  const weekEndKey = formatLocalDate(weekEnd);

  // Check saved review unless forceRefresh is true
  if (!forceRefresh) {
    const saved = await database.getFirstAsync<StoredReviewRow>(
      `SELECT report_json
       FROM weekly_health_reviews
       WHERE profile_id = ? AND week_start = ?`,
      profileId,
      weekStartKey,
    );
    if (saved) return parseStoredReview(saved.report_json);
  }

  // Determine query bounds
  const isCurrentWeek = weekStartKey === formatLocalDate(getWeekStart(now));
  const effectiveEndKey = isCurrentWeek ? formatLocalDate(now) : weekEndKey;
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;

  // Previous week calculation
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const prevWeekStartKey = formatLocalDate(prevWeekStart);
  const prevWeekEnd = new Date(weekStart);
  prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
  const prevWeekEndKey = formatLocalDate(prevWeekEnd);

  const [
    medicationRows,
    healthRows,
    reminders,
    previousMedicationRows,
    previousHealthRows,
  ] = await Promise.all([
    database.getAllAsync<MedicationRow>(
      `SELECT m.name AS medicine_name, h.status, h.scheduled_date, h.scheduled_time
       FROM medication_history h
       JOIN medicines m ON m.id = h.medicine_id
       WHERE h.user_id = ?
         AND h.scheduled_date >= ?
         AND h.scheduled_date <= ?
         AND (
           h.scheduled_date < ?
           OR (h.scheduled_date = ? AND h.scheduled_time <= ?)
           OR ? = 0
         )
       ORDER BY h.scheduled_date, h.scheduled_time, h.id`,
      profileId,
      weekStartKey,
      effectiveEndKey,
      effectiveEndKey,
      effectiveEndKey,
      isCurrentWeek ? currentTime : "23:59",
      isCurrentWeek ? 1 : 0,
    ),
    database.getAllAsync<HealthRow>(
      `SELECT metric, name, value, unit, recorded_at
       FROM health_records
       WHERE user_id = ? AND recorded_at >= ? AND recorded_at <= ?
       ORDER BY recorded_at, id`,
      profileId,
      weekStart.toISOString(),
      isCurrentWeek ? now.toISOString() : weekEnd.toISOString(),
    ),
    database.getAllAsync<ReminderRow>(
      `SELECT metric, label, start_date, scheduled_time, repeat_type, repeat_days
       FROM health_reminders
       WHERE user_id = ? AND enabled = 1`,
      profileId,
    ),
    database.getAllAsync<MedicationRow>(
      `SELECT m.name AS medicine_name, h.status, h.scheduled_date, h.scheduled_time
       FROM medication_history h
       JOIN medicines m ON m.id = h.medicine_id
       WHERE h.user_id = ?
         AND h.scheduled_date >= ?
         AND h.scheduled_date <= ?
       ORDER BY h.scheduled_date, h.scheduled_time, h.id`,
      profileId,
      prevWeekStartKey,
      prevWeekEndKey,
    ),
    database.getAllAsync<HealthRow>(
      `SELECT metric, name, value, unit, recorded_at
       FROM health_records
       WHERE user_id = ? AND recorded_at >= ? AND recorded_at <= ?
       ORDER BY recorded_at, id`,
      profileId,
      prevWeekStart.toISOString(),
      prevWeekEnd.toISOString(),
    ),
  ]);

  const review = buildReview(
    weekStart,
    now,
    medicationRows,
    healthRows,
    reminders,
    previousMedicationRows,
    previousHealthRows,
  );

  await database.runAsync(
    `INSERT OR REPLACE INTO weekly_health_reviews (
      profile_id, week_start, generated_at, report_json
    ) VALUES (?, ?, ?, ?)`,
    profileId,
    weekStartKey,
    review.generatedAt,
    JSON.stringify(review),
  );

  void scheduleWeeklyReviewNotification(profileId);

  return review;
}
