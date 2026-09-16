import {
  bytesToBase64Url,
  deriveNotificationKeyBytes,
  encryptNotificationTitle,
  importNotificationKey,
} from "@workspace/e2ee";
import { createNativeCryptoProvider } from "./native-crypto-provider";

const derivedKeys = new WeakMap<
  CryptoKey,
  Promise<{ bytes: Uint8Array<ArrayBuffer>; key: CryptoKey }>
>();

function notificationKeyFor(accountKey: CryptoKey) {
  let derived = derivedKeys.get(accountKey);
  if (!derived) {
    const crypto = createNativeCryptoProvider();
    derived = deriveNotificationKeyBytes(crypto, accountKey).then(
      async (bytes) => ({
        bytes,
        key: await importNotificationKey(crypto, bytes),
      }),
    );
    derivedKeys.set(accountKey, derived);
  }
  return derived;
}

/** Base64url notification key for the shared keychain (not the account key). */
export async function exportNotificationKey(
  accountKey: CryptoKey,
): Promise<string> {
  return bytesToBase64Url((await notificationKeyFor(accountKey)).bytes);
}

/** Ciphertext for the reminder title, or null when the title is empty. */
export async function encryptReminderTitle(
  accountKey: CryptoKey,
  eventId: string,
  title: string,
): Promise<string | null> {
  return encryptNotificationTitle(
    createNativeCryptoProvider(),
    (await notificationKeyFor(accountKey)).key,
    eventId,
    title,
  );
}
