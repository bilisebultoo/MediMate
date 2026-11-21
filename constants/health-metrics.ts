import type { HealthMetric } from "@/types/health";

export type HealthMetricOption = {
  type: HealthMetric;
  name: string;
  unit: string;
  icon: string;
};

export const HEALTH_METRICS: HealthMetricOption[] = [
  { type: "blood_pressure", name: "Blood Pressure", unit: "mmHg", icon: "♥" },
  { type: "heart_rate", name: "Heart Rate", unit: "bpm", icon: "♡" },
  { type: "blood_sugar", name: "Blood Sugar", unit: "mg/dL", icon: "◉" },
  { type: "weight", name: "Weight", unit: "kg", icon: "⚖" },
  { type: "temperature", name: "Temperature", unit: "°C", icon: "♨" },
];

export function isHealthMetric(value: string): value is HealthMetric {
  return (
    value === "blood_pressure" ||
    value === "heart_rate" ||
    value === "blood_sugar" ||
    value === "weight" ||
    value === "temperature" ||
    value === "custom"
  );
}
