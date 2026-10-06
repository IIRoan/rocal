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
import { SECURE_STORE_KEYS } from "@workspace/native-core/lib/constants";
import {
  isMailOfflineSnapshot,
  type MailOfflineSnapshot,
} from "./mail-offline-snapshot";

const SNAPSHOT_FILE = "solace-mail-offline-snapshot.json";

/** This-device-only so an iCloud/device backup of the keychain can never open the snapshot elsewhere. */
const KEY_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/** Bumped on clear so a save that started before sign-out never lands afterwards. */
let generation = 0;

function snapshotPath(): string {
  return `${FileSystem.cacheDirectory ?? ""}${SNAPSHOT_FILE}`;
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
  try {
    const path = snapshotPath();
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    const key = await readKey();
    if (!key) {
      await clearMailOfflineSnapshot();
      return null;
    }
    const raw: unknown = JSON.parse(
      await FileSystem.readAsStringAsync(path),
    );
    if (!isEncryptedSearchShard(raw)) {
      await clearMailOfflineSnapshot();
      return null;
    }
    const snapshot = await decryptSearchShard<unknown>(key, raw, {
      additionalData: additionalData(userId),
    });
    if (!isMailOfflineSnapshot(snapshot) || snapshot.userId !== userId) {
      await clearMailOfflineSnapshot();
      return null;
    }
    return snapshot;
  } catch {
    // Wrong account (AAD mismatch), corrupt file, or an older format: start clean.
    await clearMailOfflineSnapshot().catch(() => undefined);
    return null;
  }
}

export async function saveMailOfflineSnapshot(
  snapshot: MailOfflineSnapshot,
): Promise<void> {
  const startedAt = generation;
  const key = await getOrCreateKey();
  const shard = await encryptSearchShard(key, snapshot, {
    additionalData: additionalData(snapshot.userId),
    itemCount: snapshot.lists.length,
  });
  if (startedAt !== generation) return;
  await FileSystem.writeAsStringAsync(snapshotPath(), JSON.stringify(shard));
}

export async function clearMailOfflineSnapshot(): Promise<void> {
  generation += 1;
  await FileSystem.deleteAsync(snapshotPath(), { idempotent: true });
  await SecureStore.deleteItemAsync(
    SECURE_STORE_KEYS.MAIL_OFFLINE_CACHE_KEY,
    KEY_OPTIONS,
  );
}
