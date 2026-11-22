import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export async function requestExactAlarmAccess(): Promise<boolean> {
  if (Platform.OS !== "android") return true;

  try {
    const currentPermission = await Notifications.getExactAlarmPermissionsAsync();
    if (currentPermission.granted || !currentPermission.canAskAgain) {
      return currentPermission.granted;
    }

    const requestedPermission =
      await Notifications.requestExactAlarmPermissionsAsync();
    return requestedPermission.granted;
  } catch (error) {
    console.warn("Could not check exact alarm permissions:", error);
    return true;
  }
}

export async function getNotificationDelivery(): Promise<
  "alarmClock" | "bestEffort"
> {
  if (Platform.OS !== "android") return "bestEffort";

  try {
    const permission = await Notifications.getExactAlarmPermissionsAsync();
    return permission.granted !== false ? "alarmClock" : "bestEffort";
  } catch {
    return "alarmClock";
  }
}
