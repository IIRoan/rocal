import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useAuth } from "./AuthProvider";
import { queryClient } from "./QueryProvider";
import {
  invalidateQueriesForPushTap,
  mapPushNotificationToRoute,
  registerNativePushDevice,
  resolvePushDeviceMeta,
  type PushTapData,
} from "../lib/push-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type PushPermissionStatus = "unknown" | "granted" | "denied";

interface PushContextValue {
  permissionStatus: PushPermissionStatus;
  permissionDenied: boolean;
  requestPermission: () => Promise<boolean>;
  refreshRegistration: () => Promise<boolean>;
}

const PushContext = createContext<PushContextValue | null>(null);

function tapDataFromNotification(
  notification: Notifications.Notification | null | undefined,
): PushTapData {
  const data = notification?.request.content.data;
  if (!data || typeof data !== "object") {
    return {};
  }
  return data as PushTapData;
}

async function syncDeviceToken(force = false): Promise<void> {
  if (Platform.OS !== "ios") {
    return;
  }

  const meta = resolvePushDeviceMeta({
    platform: Platform.OS,
    bundleId: Constants.expoConfig?.ios?.bundleIdentifier,
    appVariant:
      typeof Constants.expoConfig?.extra?.appVariant === "string"
        ? Constants.expoConfig.extra.appVariant
        : null,
  });
  if (!meta) {
    return;
  }

  const deviceToken = await Notifications.getDevicePushTokenAsync();
  const token =
    typeof deviceToken.data === "string" ? deviceToken.data.trim() : "";
  if (!token) {
    return;
  }

  await registerNativePushDevice({ token, meta, force });
}

export function PushProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [permissionStatus, setPermissionStatus] =
    useState<PushPermissionStatus>("unknown");
  const handledTapIdsRef = useRef(new Set<string>());

  const openFromNotification = useCallback(
    (notification: Notifications.Notification | null | undefined) => {
      const identifier = notification?.request.identifier;
      if (identifier) {
        if (handledTapIdsRef.current.has(identifier)) {
          return;
        }
        handledTapIdsRef.current.add(identifier);
      }
      const data = tapDataFromNotification(notification);
      const route = mapPushNotificationToRoute(data);
      invalidateQueriesForPushTap(queryClient, data);
      if (route) {
        routerRef.current.push(route as never);
      }
    },
    [],
  );

  const refreshPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== "ios") {
      setPermissionStatus("denied");
      return false;
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }

    const granted = status === "granted";
    setPermissionStatus(granted ? "granted" : "denied");
    return granted;
  }, []);

  const refreshRegistration = useCallback(async (): Promise<boolean> => {
    const granted = await refreshPermission();
    if (!granted) {
      return false;
    }
    try {
      await syncDeviceToken(true);
      return true;
    } catch {
      return false;
    }
  }, [refreshPermission]);

  useEffect(() => {
    if (!isAuthenticated || Platform.OS !== "ios") {
      return;
    }

    let cancelled = false;

    const tokenSubscription = Notifications.addPushTokenListener((deviceToken) => {
      const token =
        typeof deviceToken.data === "string" ? deviceToken.data.trim() : "";
      if (!token) {
        return;
      }
      const meta = resolvePushDeviceMeta({
        platform: Platform.OS,
        bundleId: Constants.expoConfig?.ios?.bundleIdentifier,
        appVariant:
          typeof Constants.expoConfig?.extra?.appVariant === "string"
            ? Constants.expoConfig.extra.appVariant
            : null,
      });
      if (!meta) {
        return;
      }
      void registerNativePushDevice({ token, meta }).catch(() => {});
    });

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        openFromNotification(response.notification);
      });

    (async () => {
      const granted = await refreshPermission();
      if (cancelled || !granted) {
        return;
      }
      try {
        await syncDeviceToken();
      } catch {
        // Simulator and missing entitlements fail here; registration is best-effort.
      }

      if (cancelled) {
        return;
      }

      const lastResponse = await Notifications.getLastNotificationResponseAsync();
      if (!cancelled && lastResponse) {
        openFromNotification(lastResponse.notification);
      }
    })().catch(() => {});

    return () => {
      cancelled = true;
      tokenSubscription.remove();
      responseSubscription.remove();
    };
    // Intentionally omit `router` — expo-router's object identity churned and
    // remounted this effect, which DDoS'd PUT /api/push/devices.
  }, [isAuthenticated, openFromNotification, refreshPermission]);

  const value = useMemo<PushContextValue>(
    () => ({
      permissionStatus,
      permissionDenied: permissionStatus === "denied",
      requestPermission: refreshPermission,
      refreshRegistration,
    }),
    [permissionStatus, refreshPermission, refreshRegistration],
  );

  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}

export function usePushNotifications(): PushContextValue {
  const ctx = useContext(PushContext);
  if (!ctx) {
    throw new Error("usePushNotifications must be used within a PushProvider");
  }
  return ctx;
}
