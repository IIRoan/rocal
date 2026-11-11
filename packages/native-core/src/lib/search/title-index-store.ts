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
  type PrivateSearchCoverage,
  parsePrivateSearchCoverage,
  unknownPrivateSearchCoverage,
} from "@workspace/calendar-core";
import { createSessionDataStore } from "../session-data-lifecycle";
import { SECURE_STORE_KEYS } from "../constants";

const SHARD_FILE = "solace-private-title-index.json";

type EnabledListener = (enabled: boolean) => void;
const enabledListeners = new Set<EnabledListener>();
let enabled: boolean | undefined;

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

/** Guards the on-disk shard envelope before it reaches decryptSearchShard. */
function isEncryptedSearchShard(value: unknown): value is EncryptedSearchShard {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === 1 &&
    candidate.algorithm === "AES-GCM" &&
    typeof candidate.iv === "string" &&
    typeof candidate.ciphertext === "string"
  );
}

export async function isNativeTitleIndexEnabled(): Promise<boolean> {
  if (enabled !== undefined) return enabled;
  const stored = await SecureStore.getItemAsync(
    SECURE_STORE_KEYS.SEARCH_INDEX_ENABLED,
  );
  enabled ??= stored !== "false";
  return enabled;
}

export function setNativeTitleIndexEnabled(value: boolean): Promise<void> {
  enabled = value;
  notifyEnabled(value);
  const clearing = value ? Promise.resolve() : store.clear();
  return Promise.allSettled([
    clearing,
    store.serialize(() =>
      SecureStore.setItemAsync(
        SECURE_STORE_KEYS.SEARCH_INDEX_ENABLED,
        String(value),
      ),
    ),
  ]).then((results) => {
    if (results.some((result) => result.status === "rejected")) {
      throw new Error(
        "Private search settings could not be saved. Please retry.",
      );
    }
  });
}

async function readKey(): Promise<CryptoKey | null> {
  const stored = await SecureStore.getItemAsync(
    SECURE_STORE_KEYS.SEARCH_INDEX_KEY,
  );
  return stored ? importLocalSearchIndexKey(stored) : null;
}

const store = createSessionDataStore(async () => {
  const results = await Promise.allSettled([
    FileSystem.deleteAsync(shardPath(), { idempotent: true }),
    SecureStore.deleteItemAsync(SECURE_STORE_KEYS.SEARCH_INDEX_KEY),
  ]);
  if (results.some((result) => result.status === "rejected")) {
    throw new Error("Private search cleanup could not finish. Please retry.");
  }
});

export function captureNativeTitleIndexRequest(accountId: string) {
  const request = store.capture(accountId);
  return {
    ...request,
    isCurrent: () => request.isCurrent() && enabled !== false,
  };
}

export type NativeTitleIndexRequest = ReturnType<
  typeof captureNativeTitleIndexRequest
>;

async function getOrCreateKey(): Promise<CryptoKey> {
  const existing = await readKey();
  if (existing) return existing;

  const key = await generateLocalSearchIndexKey({ extractable: true });
  const exported = await exportLocalSearchIndexKey(key);
  await SecureStore.setItemAsync(SECURE_STORE_KEYS.SEARCH_INDEX_KEY, exported);
  return key;
}

export async function loadNativeTitleIndexSnapshot(
  accountId: string,
  request = captureNativeTitleIndexRequest(accountId),
): Promise<{ documents: TitleIndexDocument[]; coverage: PrivateSearchCoverage }> {
  const empty = () => ({ documents: [], coverage: unknownPrivateSearchCoverage() });
  const result = await store.run(request.isCurrent, async () => {
    try {
      const info = await FileSystem.getInfoAsync(shardPath());
      if (!info.exists) return empty();
      const key = await readKey();
      if (!key) return null;
      if (!request.isCurrent()) return empty();
      const parsed: unknown = JSON.parse(await FileSystem.readAsStringAsync(shardPath()));
      if (!isEncryptedSearchShard(parsed)) return null;
      const payload = await decryptSearchShard<TitleIndexShardPayload>(key, parsed, { additionalData: additionalData(accountId) });
      if (!Array.isArray(payload.documents)) return null;
      return { documents: payload.documents, coverage: parsePrivateSearchCoverage(payload.coverage) };
    } catch {
      return null;
    }
  });
  if (result === null && request.isCurrent()) await store.clear();
  return result ?? empty();
}

export async function loadNativeTitleIndex(
  accountId: string,
  request = captureNativeTitleIndexRequest(accountId),
): Promise<TitleIndexDocument[]> {
  return (await loadNativeTitleIndexSnapshot(accountId, request)).documents;
}

export async function saveNativeTitleIndex(input: {
  accountId: string;
  documents: TitleIndexDocument[];
  request?: NativeTitleIndexRequest;
  coverage?: PrivateSearchCoverage;
}): Promise<boolean> {
  const request =
    input.request ?? captureNativeTitleIndexRequest(input.accountId);
  return (
    (await store.run(request.isCurrent, async () => {
      const key = await getOrCreateKey();
      if (!request.isCurrent()) return false;
      const payload: TitleIndexShardPayload = {
        documents: input.documents,
        indexedAt: new Date().toISOString(),
        coverage: input.coverage,
      };
      const shard = await encryptSearchShard(key, payload, {
        additionalData: additionalData(input.accountId),
        itemCount: input.documents.length,
      });
      if (!request.isCurrent()) return false;
      await FileSystem.writeAsStringAsync(shardPath(), JSON.stringify(shard));
      return true;
    })) ?? false
  );
}

export function clearNativeTitleIndex(): Promise<void> {
  return store.clear();
}
