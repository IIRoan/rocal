/** Only these secrets go in the keychain access group shared with the notification extension. */
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { Platform } from "react-native";

/** Must match `SharedKeychain` in plugins/notification-service-extension. */
export const NOTIFICATION_EXTENSION_ITEMS = {
  notificationKey: "notification_key",
  mailAuth: "mail_auth",
} as const;

export type NotificationExtensionMailAuth = {
  apiBaseUrl: string;
  cookie: string;
  origin: string | null;
};

export function resolveNotificationExtensionOptions(input: {
  platform: string;
  extra: unknown;
}): SecureStore.SecureStoreOptions | null {
  if (input.platform !== "ios" || !input.extra || typeof input.extra !== "object") {
    return null;
  }
  const config = (input.extra as { notificationExtension?: unknown })
    .notificationExtension as
    | { appGroup?: unknown; keychainService?: unknown }
    | undefined;
  if (
    typeof config?.appGroup !== "string" ||
    !config.appGroup ||
    typeof config.keychainService !== "string" ||
    !config.keychainService
  ) {
    return null;
  }
  return {
    accessGroup: config.appGroup,
    keychainService: config.keychainService,
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  };
}

function sharedOptions(): SecureStore.SecureStoreOptions | null {
  return resolveNotificationExtensionOptions({
    platform: Platform.OS,
    extra: Constants.expoConfig?.extra,
  });
}

async function writeItem(key: string, value: string): Promise<void> {
  const options = sharedOptions();
  if (!options) {
    return;
  }
  const current = await SecureStore.getItemAsync(key, options);
  if (current !== value) {
    await SecureStore.setItemAsync(key, value, options);
  }
}

/** Raw 32-byte notification key (base64url), never the account key. */
export async function writeNotificationExtensionKey(
  notificationKey: string,
): Promise<void> {
  await writeItem(NOTIFICATION_EXTENSION_ITEMS.notificationKey, notificationKey);
}

export async function writeNotificationExtensionMailAuth(
  auth: NotificationExtensionMailAuth,
): Promise<void> {
  await writeItem(NOTIFICATION_EXTENSION_ITEMS.mailAuth, JSON.stringify(auth));
}

export async function clearNotificationExtensionSecrets(): Promise<void> {
  const options = sharedOptions();
  if (!options) {
    return;
  }
  await Promise.all(
    Object.values(NOTIFICATION_EXTENSION_ITEMS).map((key) =>
      SecureStore.deleteItemAsync(key, options).catch(() => undefined),
    ),
  );
}
