import * as Notifications from "expo-notifications";
import type { SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";

import { getNotificationDelivery } from "@/services/notificationPermissions";

const REMINDER_KIND = "medication-refill-reminder";
const REFILL_NOTICE_DAYS = 3;
const MAX_PENDING_REMINDERS = 100;
let refreshQueue: Promise<number> = Promise.resolve(0);

type RefillRecord = {
  id: number;
  user_id: string;
  name: string;
  end_date: string;
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
  const date = new Date(year, month, day, 9);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function refreshRefillNotifications(
  database: SQLiteDatabase,
): Promise<number> {
  const refresh = refreshQueue.then(
    () => performRefillNotificationRefresh(database),
    () => performRefillNotificationRefresh(database),
  );
  refreshQueue = refresh;
  return refresh;
}

async function performRefillNotificationRefresh(
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

  const records = await database.getAllAsync<RefillRecord>(
    `SELECT id, user_id, name, end_date
     FROM medicines
     WHERE status = 'ACTIVE'
       AND end_date IS NOT NULL
       AND COALESCE((
         SELECT setting_value
         FROM profile_settings
         WHERE profile_id = medicines.user_id
           AND setting_key = 'notifications.refill'
       ), 'true') = 'true'
     ORDER BY end_date, id`,
  );

  const now = new Date();
  const reminders = records.flatMap((record) => {
    const endDate = parseLocalDate(record.end_date);
    if (!endDate) {
      console.error("Skipping invalid medication end date:", record.id);
      return [];
    }
    endDate.setDate(endDate.getDate() - REFILL_NOTICE_DAYS);
    return endDate > now ? [{ record, date: endDate }] : [];
  });
  reminders.sort((first, second) => first.date.getTime() - second.date.getTime());
  const delivery = await getNotificationDelivery();
  const upcomingReminders = reminders.slice(0, MAX_PENDING_REMINDERS);

  await Promise.all(
    upcomingReminders.map(({ record, date }) =>
      Notifications.scheduleNotificationAsync({
        content: {
          title: "Medication refill reminder",
          body: `${record.name} is scheduled to end in ${REFILL_NOTICE_DAYS} days.`,
          sound: "default",
          data: {
            kind: REMINDER_KIND,
            medicineId: record.id,
            userId: record.user_id,
            url: "/home",
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
          delivery,
        },
      }),
    ),
  );

  return upcomingReminders.length;
}
