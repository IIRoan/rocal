import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

const FOREGROUND_NOTIFICATION_BEHAVIOR: Notifications.NotificationBehavior = {
  shouldShowBanner: true,
  shouldShowList: true,
  shouldPlaySound: true,
  shouldSetBadge: false,
};

let registered = false;

/**
 * Register the iOS foreground notification handler as early as possible.
 * expo-notifications discards remote alerts when no handler responds within
 * ~3 seconds, so this must run before the router and other heavy startup work.
 */
export function registerForegroundPushNotificationHandler(): void {
  if (registered || Platform.OS !== "ios") {
    return;
  }

  registered = true;
  Notifications.setNotificationHandler({
    handleNotification: () => FOREGROUND_NOTIFICATION_BEHAVIOR,
    handleError: (notificationId, error) => {
      if (__DEV__) {
        console.warn(
          "[push] foreground notification handler failed",
          notificationId,
          error,
        );
      }
    },
  });
}
