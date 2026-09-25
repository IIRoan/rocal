import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import {
  decryptSearchShard,
  encryptSearchShard,
  exportLocalSearchIndexKey,
  generateLocalSearchIndexKey,
  importLocalSearchIndexKey,
  type EncryptedSearchShard,
  type TitleIndexDocument,
  type TitleIndexShardPayload,
} from "@workspace/calendar-core";
import { SECURE_STORE_KEYS } from "../constants";

const SHARD_FILE = "solace-private-title-index.json";

type EnabledListener = (enabled: boolean) => void;
const enabledListeners = new Set<EnabledListener>();

function notifyEnabled(enabled: boolean) {
  for (const listener of enabledListeners) listener(enabled);
}

export function subscribeNativeTitleIndexEnabled(
  listener: EnabledListener,
): () => void {
  enabledListeners.add(listener);
  return () => {
    enabledListeners.delete(listener);
  };
}

function shardPath(): string {
  return `${FileSystem.documentDirectory ?? ""}${SHARD_FILE}`;
}

function additionalData(accountId: string): string {
  return `title:${accountId}`;
}

export async function isNativeTitleIndexEnabled(): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(
    SECURE_STORE_KEYS.SEARCH_INDEX_ENABLED,
  );
  return stored !== "false";
}

export async function setNativeTitleIndexEnabled(
  enabled: boolean,
): Promise<void> {
  await SecureStore.setItemAsync(
    SECURE_STORE_KEYS.SEARCH_INDEX_ENABLED,
    enabled ? "true" : "false",
  );
  notifyEnabled(enabled);
  if (!enabled) {
    await clearNativeTitleIndex();
  }
}

async function getOrCreateKey(): Promise<CryptoKey> {
  const stored = await SecureStore.getItemAsync(
    SECURE_STORE_KEYS.SEARCH_INDEX_KEY,
  );
  if (stored) {
    return importLocalSearchIndexKey(stored);
  }

  const key = await generateLocalSearchIndexKey({ extractable: true });
  const exported = await exportLocalSearchIndexKey(key);
  await SecureStore.setItemAsync(SECURE_STORE_KEYS.SEARCH_INDEX_KEY, exported);
  return key;
}

export async function loadNativeTitleIndex(
  accountId: string,
): Promise<TitleIndexDocument[]> {
  try {
    const path = shardPath();
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return [];

    const raw = await FileSystem.readAsStringAsync(path);
    const shard = JSON.parse(raw) as EncryptedSearchShard;
    const key = await getOrCreateKey();
    const payload = await decryptSearchShard<TitleIndexShardPayload>(
      key,
      shard,
      { additionalData: additionalData(accountId) },
    );
    return payload.documents;
  } catch {
    return [];
  }
}

export async function saveNativeTitleIndex(input: {
  accountId: string;
  documents: TitleIndexDocument[];
}): Promise<void> {
  const key = await getOrCreateKey();
  const payload: TitleIndexShardPayload = {
    documents: input.documents,
    indexedAt: new Date().toISOString(),
  };
  const shard = await encryptSearchShard(key, payload, {
    additionalData: additionalData(input.accountId),
    itemCount: input.documents.length,
  });
  await FileSystem.writeAsStringAsync(shardPath(), JSON.stringify(shard));
}

export async function clearNativeTitleIndex(): Promise<void> {
  const path = shardPath();
  const info = await FileSystem.getInfoAsync(path);
  if (info.exists) {
    await FileSystem.deleteAsync(path, { idempotent: true });
  }
  await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.SEARCH_INDEX_KEY);
}
