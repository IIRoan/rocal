import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useAuth } from "./AuthProvider";
import { queryClient } from "./QueryProvider";
import {
  extractPushTapData,
  invalidateQueriesForPushTap,
  mapPushNotificationToRoute,
} from "../lib/push-notifications";

let consumedLaunchNotificationResponse = false;

async function consumeLaunchNotificationResponse(
  openFromNotification: (
    notification: Notifications.Notification | null | undefined,
    source: "launch" | "tap",
  ) => void,
): Promise<void> {
  if (consumedLaunchNotificationResponse) {
    return;
  }
  consumedLaunchNotificationResponse = true;

  const lastResponse = await Notifications.getLastNotificationResponseAsync();
  if (lastResponse) {
    openFromNotification(lastResponse.notification, "launch");
  }
}

export function PushNotificationNavigation({
  navigationReady,
}: {
  navigationReady: boolean;
}): null {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const navigationReadyRef = useRef(navigationReady);
  navigationReadyRef.current = navigationReady;
  const handledTapIdsRef = useRef(new Set<string>());
  const pendingRouteRef = useRef<string | null>(null);

  const openFromNotification = useCallback(
    (
      notification: Notifications.Notification | null | undefined,
      source: "launch" | "tap",
    ) => {
      const identifier = notification?.request.identifier;
      if (identifier) {
        if (handledTapIdsRef.current.has(identifier)) {
          return;
        }
        handledTapIdsRef.current.add(identifier);
      }

      const data = extractPushTapData(notification);
      const route = mapPushNotificationToRoute(data);
      invalidateQueriesForPushTap(queryClient, data);
      if (!route) {
        return;
      }

      const shouldDeferNavigation =
        source === "launch" && !navigationReadyRef.current;
      if (!shouldDeferNavigation && navigationReadyRef.current) {
        routerRef.current.replace(route as never);
        return;
      }

      pendingRouteRef.current = route;
    },
    [],
  );

  useEffect(() => {
    if (!navigationReady || !pendingRouteRef.current) {
      return;
    }

    const route = pendingRouteRef.current;
    pendingRouteRef.current = null;
    routerRef.current.replace(route as never);
  }, [navigationReady]);

  useEffect(() => {
    if (!isAuthenticated || Platform.OS !== "ios") {
      return;
    }

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        openFromNotification(response.notification, "tap");
      });

    void consumeLaunchNotificationResponse(openFromNotification).catch(() => {});

    return () => {
      responseSubscription.remove();
    };
  }, [isAuthenticated, openFromNotification]);

  return null;
}
