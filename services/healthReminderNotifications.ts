import * as Notifications from "expo-notifications";
import type { SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";

import { getNotificationDelivery } from "@/services/notificationPermissions";
import type { HealthMetric } from "@/types/health";

const REMINDER_KIND = "health-measurement-reminder";
const SCHEDULE_DAYS = 60;
const MAX_PENDING_REMINDERS = 120;
let refreshQueue: Promise<number> = Promise.resolve(0);

type HealthReminderRecord = {
  id: number;
  user_id: string;
  metric: HealthMetric;
  label: string | null;
  start_date: string;
  scheduled_time: string;
  repeat_type: "once" | "weekly";
  repeat_days: string;
};

function isPermissionGranted(status: Notifications.NotificationPermissionsStatus) {
  return (
    status.status === "granted" ||
    status.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    status.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}

function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function parseTime(value: string): { hour: number; minute: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function getRepeatDays(value: string, reminderId: number): number[] {
  try {
    const days: unknown = JSON.parse(value);
    if (
      Array.isArray(days) &&
      days.every(
        (day) => Number.isInteger(day) && day >= 0 && day <= 6,
      )
    ) {
      return days;
    }
  } catch (error) {
    console.error("Invalid health reminder repeat days:", reminderId, error);
  }
  return [];
}

function getMetricLabel(record: HealthReminderRecord): string {
  if (record.metric === "custom" && record.label?.trim()) {
    return record.label.trim();
  }
  switch (record.metric) {
    case "blood_pressure":
      return "blood pressure";
    case "heart_rate":
      return "heart rate";
    case "blood_sugar":
      return "blood sugar";
    case "weight":
      return "weight";
    case "temperature":
      return "temperature";
    case "custom":
      return "health measurement";
  }
}

export function refreshHealthReminderNotifications(
  database: SQLiteDatabase,
): Promise<number> {
  const refresh = refreshQueue.then(
    () => performHealthReminderRefresh(database),
    () => performHealthReminderRefresh(database),
  );
  refreshQueue = refresh;
  return refresh;
}

async function performHealthReminderRefresh(
  database: SQLiteDatabase,
): Promise<number> {
  if (Platform.OS === "web") return 0;

  const [permissionStatus, scheduledNotifications] = await Promise.all([
    Notifications.getPermissionsAsync(),
    Notifications.getAllScheduledNotificationsAsync(),
  ]);
  const existing = scheduledNotifications.filter(
    (notification) => notification.content.data?.kind === REMINDER_KIND,
  );
  await Promise.all(
    existing.map((notification) =>
      Notifications.cancelScheduledNotificationAsync(notification.identifier),
    ),
  );

  if (!isPermissionGranted(permissionStatus)) return 0;

  const records = await database.getAllAsync<HealthReminderRecord>(
    `SELECT id, user_id, metric, label, start_date, scheduled_time,
            repeat_type, repeat_days
     FROM health_reminders
     WHERE enabled = 1
       AND COALESCE((
         SELECT setting_value
         FROM profile_settings
         WHERE profile_id = health_reminders.user_id
           AND setting_key = 'notifications.health'
       ), 'true') = 'true'
     ORDER BY start_date, scheduled_time, id`,
  );
  const now = new Date();
  const lastDate = new Date(now);
  lastDate.setDate(lastDate.getDate() + SCHEDULE_DAYS);

  const reminders: { record: HealthReminderRecord; date: Date }[] = [];
  for (const record of records) {
    const startDate = parseLocalDate(record.start_date);
    const time = parseTime(record.scheduled_time);
    if (!startDate || !time) {
      console.error("Skipping invalid health reminder:", record.id);
      continue;
    }

    if (record.repeat_type === "once") {
      const date = new Date(startDate);
      date.setHours(time.hour, time.minute, 0, 0);
      if (date > now) reminders.push({ record, date });
      continue;
    }

    const days = new Set(getRepeatDays(record.repeat_days, record.id));
    if (days.size === 0) {
      console.error("Skipping weekly reminder without repeat days:", record.id);
      continue;
    }

    const cursor = new Date(startDate);
    while (cursor <= lastDate) {
      if (days.has(cursor.getDay())) {
        const date = new Date(cursor);
        date.setHours(time.hour, time.minute, 0, 0);
        if (date > now) reminders.push({ record, date });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  reminders.sort((first, second) => first.date.getTime() - second.date.getTime());
  const upcomingReminders = reminders.slice(0, MAX_PENDING_REMINDERS);
  const delivery = await getNotificationDelivery();

  await Promise.all(
    upcomingReminders.map(({ record, date }) => {
      const metricLabel = getMetricLabel(record);
      return Notifications.scheduleNotificationAsync({
        content: {
          title: `Time to measure your ${metricLabel}`,
          body: `Your scheduled ${metricLabel} reminder is due now.`,
          sound: "default",
          data: {
            kind: REMINDER_KIND,
            reminderId: record.id,
            userId: record.user_id,
            url: "/health/health-reminders",
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
          delivery,
        },
      });
    }),
  );

  return upcomingReminders.length;
}
