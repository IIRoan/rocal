import {
  deriveNotificationKeyBytes,
  encryptNotificationTitle,
  importNotificationKey,
  type CryptoProvider,
} from "@workspace/e2ee";
import { waitForPendingE2eeBootstrap } from "./e2ee-bootstrap";
import { getActiveE2eeSession } from "./e2ee-session";

const notificationKeys = new WeakMap<CryptoKey, Promise<CryptoKey>>();

function webCrypto(): CryptoProvider {
  return globalThis.crypto as unknown as CryptoProvider;
}

async function getEncryptionSession() {
  const session = getActiveE2eeSession();
  if (session) {
    return session;
  }
  const pendingBootstrap = waitForPendingE2eeBootstrap();
  if (!pendingBootstrap) {
    return null;
  }
  await pendingBootstrap.catch(() => undefined);
  return getActiveE2eeSession();
}

function notificationKeyFor(accountKey: CryptoKey): Promise<CryptoKey> {
  let key = notificationKeys.get(accountKey);
  if (!key) {
    const crypto = webCrypto();
    key = deriveNotificationKeyBytes(crypto, accountKey).then((bytes) =>
      importNotificationKey(crypto, bytes),
    );
    notificationKeys.set(accountKey, key);
  }
  return key;
}

/** Ciphertext replaces the stored title, `null` clears it, `undefined` (cannot encrypt) keeps it. */
export async function encryptReminderTitle(
  eventId: string,
  title: string | null | undefined,
): Promise<string | null | undefined> {
  if (!title?.trim()) {
    return null;
  }
  const session = await getEncryptionSession();
  if (!session) {
    return undefined;
  }
  return encryptNotificationTitle(
    webCrypto(),
    await notificationKeyFor(session.accountKey),
    eventId,
    title,
  );
}
