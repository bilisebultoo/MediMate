import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import type { SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";
import {
  getNotificationDelivery,
  requestExactAlarmAccess,
} from "@/services/notificationPermissions";

const CHANNEL_ID = "appointment-reminders";
const REMINDER_KIND = "appointment-reminder";
const MAX_PENDING_REMINDERS = 100;
let refreshQueue: Promise<number> = Promise.resolve(0);

type AppointmentReminderRecord = {
  id: number;
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  location: string;
  reminder_minutes: number;
};

function shouldUseAppointmentChannel() {
  const isExpoGo =
    Constants.expoGoConfig != null || Constants.appOwnership === "expo";
  return Platform.OS === "android" && !isExpoGo;
}

function isPermissionGranted(
  status: Notifications.NotificationPermissionsStatus,
) {
  const iosStatus = status.ios?.status;
  return (
    status.status === "granted" ||
    iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}

async function ensureAndroidChannel() {
  if (!shouldUseAppointmentChannel()) return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Appointment reminders",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
  });
}

export function configureAppointmentNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function requestAppointmentPermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  await ensureAndroidChannel();
  const currentPermissions = await Notifications.getPermissionsAsync();
  const notificationsGranted =
    isPermissionGranted(currentPermissions) ||
    isPermissionGranted(await Notifications.requestPermissionsAsync());
  if (!notificationsGranted) return false;

  return requestExactAlarmAccess();
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

export function refreshAppointmentNotifications(
  database: SQLiteDatabase,
): Promise<number> {
  const refresh = refreshQueue.then(
    () => performAppointmentNotificationRefresh(database),
    () => performAppointmentNotificationRefresh(database),
  );
  refreshQueue = refresh;
  return refresh;
}

async function performAppointmentNotificationRefresh(
  database: SQLiteDatabase,
): Promise<number> {
  if (Platform.OS === "web") return 0;
  await ensureAndroidChannel();

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

  const records = await database.getAllAsync<AppointmentReminderRecord>(
    `SELECT id, title, scheduled_date, scheduled_time, location, reminder_minutes
     FROM appointments
     WHERE COALESCE((
       SELECT setting_value
       FROM profile_settings
       WHERE profile_id = appointments.user_id
         AND setting_key = 'notifications.appointment'
     ), 'true') = 'true'
     ORDER BY scheduled_date, scheduled_time, id`,
  );

  const now = new Date();
  const reminders: {
    record: AppointmentReminderRecord;
    reminderDate: Date;
    appointmentDate: Date;
    reminderType: "advance" | "at-time";
  }[] = [];

  for (const record of records) {
    const appointmentDate = parseScheduledDate(
      record.scheduled_date,
      record.scheduled_time,
    );
    if (!appointmentDate) {
      console.error("Skipping invalid appointment time:", record.id);
      continue;
    }
    if (appointmentDate <= now) continue;

    if (record.reminder_minutes > 0) {
      const advanceReminderDate = new Date(
        appointmentDate.getTime() - record.reminder_minutes * 60 * 1000,
      );
      if (advanceReminderDate > now) {
        reminders.push({
          record,
          reminderDate: advanceReminderDate,
          appointmentDate,
          reminderType: "advance",
        });
      }
    }
    reminders.push({
      record,
      reminderDate: appointmentDate,
      appointmentDate,
      reminderType: "at-time",
    });
  }

  reminders.sort(
    (first, second) =>
      first.reminderDate.getTime() - second.reminderDate.getTime(),
  );
  const scheduledReminders = reminders.slice(0, MAX_PENDING_REMINDERS);
  const delivery = await getNotificationDelivery();

  await Promise.all(
    scheduledReminders.map(
      ({ record, reminderDate, appointmentDate, reminderType }) =>
        Notifications.scheduleNotificationAsync({
          content: {
            title:
              reminderType === "at-time"
                ? "Appointment time"
                : "Upcoming appointment",
            body:
              reminderType === "at-time"
                ? `${record.title} is scheduled now${record.location ? ` - ${record.location}` : ""}`
                : `${record.title} at ${appointmentDate.toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}${record.location ? ` - ${record.location}` : ""}`,
            sound: "default",
            data: {
              kind: REMINDER_KIND,
              appointmentId: record.id,
              reminderType,
              url: "/(tabs)/calendar",
            },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: reminderDate,
            delivery,
            ...(shouldUseAppointmentChannel() ? { channelId: CHANNEL_ID } : {}),
          },
        }),
    ),
  );

  return scheduledReminders.length;
}
