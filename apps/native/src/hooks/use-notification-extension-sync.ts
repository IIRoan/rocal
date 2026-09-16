import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { useAuth } from "../providers/AuthProvider";
import { useE2ee } from "../providers/E2eeProvider";
import { getNativeExpoOrigin } from "../lib/api";
import { API_BASE_URL } from "../lib/constants";
import {
  clearNotificationExtensionSecrets,
  writeNotificationExtensionKey,
  writeNotificationExtensionMailAuth,
} from "../lib/notification-extension-store";
import { exportNotificationKey } from "../lib/notification-title-crypto";
import { getSessionCookieAsync } from "../lib/session-cookie";

async function syncMailAuth(): Promise<void> {
  const cookie = await getSessionCookieAsync();
  if (!cookie) {
    return;
  }
  await writeNotificationExtensionMailAuth({
    apiBaseUrl: API_BASE_URL,
    cookie,
    origin: getNativeExpoOrigin() || null,
  });
}

/** Keeps the notification extension's shared-keychain secrets in step with the session, cleared on sign-out. */
export function useNotificationExtensionSync(): void {
  const { isAuthenticated, isLoading } = useAuth();
  const { isEnabled, isReady, runWithAccountKey } = useE2ee();

  useEffect(() => {
    if (Platform.OS !== "ios" || isLoading) {
      return;
    }
    if (!isAuthenticated) {
      void clearNotificationExtensionSecrets();
      return;
    }

    void syncMailAuth().catch(() => undefined);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void syncMailAuth().catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    if (Platform.OS !== "ios" || !isAuthenticated || !isReady || !isEnabled) {
      return;
    }
    let cancelled = false;
    void runWithAccountKey(async (accountKey) => {
      const notificationKey = await exportNotificationKey(accountKey);
      if (!cancelled) {
        await writeNotificationExtensionKey(notificationKey);
      }
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isEnabled, isReady, runWithAccountKey]);
}
