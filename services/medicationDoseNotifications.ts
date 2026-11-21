import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import type { SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";
import {
  getNotificationDelivery,
  requestExactAlarmAccess,
} from "@/services/notificationPermissions";

const CHANNEL_ID = "medication-reminders";
const REMINDER_KIND = "medication-dose-reminder";
const LEGACY_REMINDER_KIND = "medication-meal-reminder";
const MAX_PENDING_REMINDERS = 60;
const SCHEDULE_DAYS = 30;

function shouldUseMedicationChannel() {
  const isExpoGo =
    Constants.expoGoConfig != null || Constants.appOwnership === "expo";

  return Platform.OS === "android" && !isExpoGo;
}

export function configureMedicationDoseNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

type PendingDoseRecord = {
  id: number;
  name: string;
  dose: string;
  scheduled_date: string;
  scheduled_time: string;
};

let refreshQueue: Promise<number> = Promise.resolve(0);

function isPermissionGranted(
  status: Notifications.NotificationPermissionsStatus,
) {
  const iosStatus = status.ios?.status;

  return (
    status.status === "granted" ||
    iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    status.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}

async function ensureAndroidChannel() {
  if (!shouldUseMedicationChannel()) return;

  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Medication reminders",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
  });
}

export async function requestMedicationDosePermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  await ensureAndroidChannel();

  const currentPermissions = await Notifications.getPermissionsAsync();
  const notificationsGranted =
    isPermissionGranted(currentPermissions) ||
    isPermissionGranted(await Notifications.requestPermissionsAsync());
  if (!notificationsGranted) return false;

  return requestExactAlarmAccess();
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseScheduledDate(dateValue: string, timeValue: string): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeValue);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]) - 1;
  const day = Number(dateMatch[3]);
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const date = new Date(year, month, day, hours, minutes);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day ||
    date.getHours() !== hours ||
    date.getMinutes() !== minutes
  ) {
    return null;
  }

  return date;
}

export function refreshMedicationDoseNotifications(
  database: SQLiteDatabase,
): Promise<number> {
  const refresh = refreshQueue.then(
    () => performMedicationDoseRefresh(database),
    () => performMedicationDoseRefresh(database),
  );
  refreshQueue = refresh;
  return refresh;
}

async function performMedicationDoseRefresh(
  database: SQLiteDatabase,
): Promise<number> {
  if (Platform.OS === "web") return 0;

  await ensureAndroidChannel();

  const [permissionStatus, scheduledNotifications] = await Promise.all([
    Notifications.getPermissionsAsync(),
    Notifications.getAllScheduledNotificationsAsync(),
  ]);
  const currentReminders = scheduledNotifications.filter((notification) => {
    const kind = notification.content.data?.kind;
    return kind === REMINDER_KIND || kind === LEGACY_REMINDER_KIND;
  });
  await Promise.all(
    currentReminders.map((notification) =>
      Notifications.cancelScheduledNotificationAsync(notification.identifier),
    ),
  );

  if (!isPermissionGranted(permissionStatus)) return 0;

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const lastDate = new Date(today);
  lastDate.setDate(lastDate.getDate() + SCHEDULE_DAYS - 1);
  const records = await database.getAllAsync<PendingDoseRecord>(
    `SELECT h.id, m.name, m.dose, h.scheduled_date, h.scheduled_time
     FROM medication_history h
     JOIN medicines m ON m.id = h.medicine_id
     WHERE h.status = 'PENDING'
       AND m.status = 'ACTIVE'
       AND COALESCE((
         SELECT setting_value
         FROM profile_settings
         WHERE profile_id = h.user_id
           AND setting_key = 'notifications.medication'
       ), 'true') = 'true'
       AND h.scheduled_date >= ?
       AND h.scheduled_date <= ?
     ORDER BY h.scheduled_date, h.scheduled_time, h.id`,
    formatDateOnly(today),
    formatDateOnly(lastDate),
  );

  const reminders = records.flatMap((record) => {
    const date = parseScheduledDate(
      record.scheduled_date,
      record.scheduled_time,
    );
    if (!date) {
      console.error("Skipping invalid medication dose time:", record.id);
      return [];
    }

    return date > now ? [{ record, date }] : [];
  });
  const upcomingReminders = reminders.slice(0, MAX_PENDING_REMINDERS);
  const delivery = await getNotificationDelivery();

  await Promise.all(
    upcomingReminders.map(({ record, date }) =>
      Notifications.scheduleNotificationAsync({
        content: {
          title: "Time to take your medicine",
          body: `${record.name}: take ${record.dose}.`,
          sound: "default",
          data: {
            kind: REMINDER_KIND,
            doseId: record.id,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
          delivery,
          ...(shouldUseMedicationChannel() ? { channelId: CHANNEL_ID } : {}),
        },
      }),
    ),
  );

  return upcomingReminders.length;
}
