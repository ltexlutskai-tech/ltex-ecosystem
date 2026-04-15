import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { notificationsApi } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerPushToken(): Promise<string | null> {
  try {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;
    const platform = Platform.OS === "ios" ? "ios" : "android";

    await notificationsApi.registerToken(token, platform);

    return token;
  } catch {
    return null;
  }
}
