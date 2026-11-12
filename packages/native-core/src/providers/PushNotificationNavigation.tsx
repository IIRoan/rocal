import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useAuth } from "./AuthProvider";
import { queryClient } from "./QueryProvider";
import {
  extractPushTapData,
  type PushTapHandler,
} from "../lib/push-notifications";

let consumedLaunchNotificationResponse = false;
let launchNotificationResponse: Promise<Notifications.NotificationResponse | null> | null = null;

async function consumeLaunchNotificationResponse(
  openFromNotification: (
    notification: Notifications.Notification | null | undefined,
    source: "launch" | "tap",
  ) => boolean,
): Promise<void> {
  if (consumedLaunchNotificationResponse) {
    return;
  }
  launchNotificationResponse ??= Notifications.getLastNotificationResponseAsync();
  const lastResponse = await launchNotificationResponse;
  if (consumedLaunchNotificationResponse) return;
  if (!lastResponse || openFromNotification(lastResponse.notification, "launch")) {
    consumedLaunchNotificationResponse = true;
    launchNotificationResponse = null;
  }
}

export function PushNotificationNavigation({
  navigationReady,
  handler,
}: {
  navigationReady: boolean;
  handler: PushTapHandler;
}): null {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const routerRef = useRef(router);
  const navigationReadyRef = useRef(navigationReady);
  const handledTapIdsRef = useRef(new Set<string>());
  const pendingRouteRef = useRef<string | null>(null);
  const handlerRef = useRef(handler);
  useLayoutEffect(() => {
    routerRef.current = router;
    navigationReadyRef.current = navigationReady;
    handlerRef.current = handler;
  }, [router, navigationReady, handler]);

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
      const route = handlerRef.current.route(data);
      handlerRef.current.invalidate(queryClient, data);
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

    let active = true;
    const openWhileActive = (
      notification: Notifications.Notification | null | undefined,
      source: "launch" | "tap",
    ) => {
      if (!active) return false;
      openFromNotification(notification, source);
      return true;
    };
    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        openWhileActive(response.notification, "tap");
      });

    void consumeLaunchNotificationResponse(openWhileActive).catch(() => {});

    return () => {
      active = false;
      responseSubscription.remove();
    };
  }, [isAuthenticated, openFromNotification]);

  return null;
}
