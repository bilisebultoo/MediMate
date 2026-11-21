import type { HealthMetric } from "@/types/health";

export type HealthReminderRepeat = "once" | "weekly";

export interface HealthReminder {
  id: number;
  userId: string;
  metric: HealthMetric;
  label: string | null;
  startDate: string;
  scheduledTime: string;
  repeatType: HealthReminderRepeat;
  repeatDays: number[];
  enabled: boolean;
}

export type HealthReminderInput = Omit<
  HealthReminder,
  "id" | "userId" | "enabled"
>;
