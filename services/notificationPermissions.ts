import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

function supportsAndroidExactAlarms(): boolean {
  const isExpoGo =
    Constants.expoGoConfig != null || Constants.appOwnership === "expo";
  return Platform.OS === "android" && !isExpoGo;
}

export async function requestExactAlarmAccess(): Promise<boolean> {
  if (!supportsAndroidExactAlarms()) return true;

  const currentPermission = await Notifications.getExactAlarmPermissionsAsync();
  if (currentPermission.granted || !currentPermission.canAskAgain) {
    return currentPermission.granted;
  }

  const requestedPermission =
    await Notifications.requestExactAlarmPermissionsAsync();
  return requestedPermission.granted;
}

export async function getNotificationDelivery(): Promise<
  "alarmClock" | "bestEffort"
> {
  if (!supportsAndroidExactAlarms()) return "bestEffort";

  const permission = await Notifications.getExactAlarmPermissionsAsync();
  return permission.granted ? "alarmClock" : "bestEffort";
}
