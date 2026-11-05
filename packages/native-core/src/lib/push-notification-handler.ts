import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

const FOREGROUND_NOTIFICATION_BEHAVIOR: Notifications.NotificationBehavior = {
  shouldShowBanner: true,
  shouldShowList: true,
  shouldPlaySound: true,
  shouldSetBadge: false,
};

let registered = false;

/** Register before navigation mounts so foreground alerts use the app's notification behavior. */
export function registerForegroundPushNotificationHandler(): void {
  if (registered || Platform.OS !== "ios") {
    return;
  }

  registered = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => FOREGROUND_NOTIFICATION_BEHAVIOR,
    handleError: () => {
      if (__DEV__) {
        console.warn("[push] foreground notification handler failed");
      }
    },
  });
}
