import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import {
  decryptSearchShard,
  encryptSearchShard,
  exportLocalSearchIndexKey,
  generateLocalSearchIndexKey,
  importLocalSearchIndexKey,
  type EncryptedSearchShard,
} from "@workspace/calendar-core";
import {
  createSessionDataStore,
  type SessionDataScope,
  isSessionDataScopeCurrent,
} from "@workspace/native-core/lib/session-data-lifecycle";
import { SECURE_STORE_KEYS } from "@workspace/native-core/lib/constants";
import {
  isMailOfflineSnapshot,
  type MailOfflineSnapshot,
} from "./mail-offline-snapshot";

export const MAIL_OFFLINE_SNAPSHOT_FILE = "solace-mail-offline-snapshot.json";

/** This-device-only so an iCloud/device backup of the keychain can never open the snapshot elsewhere. */
const KEY_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const store = createSessionDataStore(async () => {
  const results = await Promise.allSettled([
    FileSystem.deleteAsync(snapshotPath(), { idempotent: true }),
    SecureStore.deleteItemAsync(
      SECURE_STORE_KEYS.MAIL_OFFLINE_CACHE_KEY,
      KEY_OPTIONS,
    ),
  ]);
  if (results.some((result) => result.status === "rejected")) {
    throw new Error("Mailbox cleanup could not finish. Please retry.");
  }
});

function snapshotPath(): string {
  return `${FileSystem.cacheDirectory ?? ""}${MAIL_OFFLINE_SNAPSHOT_FILE}`;
}

function additionalData(userId: string): string {
  return `mail-offline:v1:${userId}`;
}

function isEncryptedSearchShard(value: unknown): value is EncryptedSearchShard {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    record.algorithm === "AES-GCM" &&
    typeof record.iv === "string" &&
    typeof record.ciphertext === "string" &&
    typeof record.updatedAt === "string" &&
    typeof record.itemCount === "number"
  );
}

async function readKey(): Promise<CryptoKey | null> {
  const stored = await SecureStore.getItemAsync(
    SECURE_STORE_KEYS.MAIL_OFFLINE_CACHE_KEY,
    KEY_OPTIONS,
  );
  return stored ? importLocalSearchIndexKey(stored) : null;
}

async function getOrCreateKey(): Promise<CryptoKey> {
  const existing = await readKey();
  if (existing) return existing;
  const key = await generateLocalSearchIndexKey({ extractable: true });
  await SecureStore.setItemAsync(
    SECURE_STORE_KEYS.MAIL_OFFLINE_CACHE_KEY,
    await exportLocalSearchIndexKey(key),
    KEY_OPTIONS,
  );
  return key;
}

/** Returns the saved snapshot for `userId`, or null when missing, unreadable, or written for another account. */
export async function loadMailOfflineSnapshot(
  userId: string,
): Promise<MailOfflineSnapshot | null> {
  const request = store.capture(userId);
  const result = await store
    .run(request.isCurrent, async () => {
      const info = await FileSystem.getInfoAsync(snapshotPath());
      if (!info.exists) return null;
      const key = await readKey();
      if (!key) throw new Error("Mailbox snapshot key is unavailable.");
      const raw: unknown = JSON.parse(
        await FileSystem.readAsStringAsync(snapshotPath()),
      );
      if (!isEncryptedSearchShard(raw))
        throw new Error("Mailbox snapshot is unreadable.");
      const snapshot = await decryptSearchShard<unknown>(key, raw, {
        additionalData: additionalData(userId),
      });
      if (!isMailOfflineSnapshot(snapshot) || snapshot.userId !== userId) {
        throw new Error("Mailbox snapshot belongs to another account.");
      }
      return snapshot;
    })
    .catch(async () => {
      if (request.isCurrent()) await store.clear();
      return null;
    });
  return result ?? null;
}

export async function saveMailOfflineSnapshot(
  snapshot: MailOfflineSnapshot,
  scope?: SessionDataScope | null,
): Promise<void> {
  const request = store.capture(snapshot.userId);
  const isCurrent = () =>
    request.isCurrent() &&
    (scope === undefined || isSessionDataScopeCurrent(scope));
  await store.run(isCurrent, async () => {
    const key = await getOrCreateKey();
    if (!isCurrent()) return;
    const shard = await encryptSearchShard(key, snapshot, {
      additionalData: additionalData(snapshot.userId),
      itemCount: snapshot.lists.length,
    });
    if (!isCurrent()) return;
    await FileSystem.writeAsStringAsync(snapshotPath(), JSON.stringify(shard));
  });
}

export function clearMailOfflineSnapshot(): Promise<void> {
  return store.clear();
}
