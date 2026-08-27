import {
  decryptSearchShard,
  encryptSearchShard,
  generateLocalSearchIndexKey,
  type EncryptedSearchShard,
} from "@workspace/calendar-core";

export {
  decryptSearchShard,
  encryptSearchShard,
  generateLocalSearchIndexKey,
  type EncryptedSearchShard,
};

const LOCAL_SEARCH_DB_NAME = "solace-private-search";
const LOCAL_SEARCH_STORE_NAME = "encrypted-shards";
const LOCAL_SEARCH_KEY_STORE_NAME = "keys";
const LOCAL_SEARCH_DB_VERSION = 2;
const TITLE_INDEX_RECORD_ID = "title-index";
const TITLE_INDEX_KEY_ID = "title-index-key";

export type SearchShardRecord = {
  id: string;
  source: "calendar" | "mail" | "title";
  accountId: string;
  shard: EncryptedSearchShard;
};

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error("Local private search index storage is unavailable."),
    );
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_SEARCH_DB_NAME, LOCAL_SEARCH_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LOCAL_SEARCH_STORE_NAME)) {
        database.createObjectStore(LOCAL_SEARCH_STORE_NAME, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(LOCAL_SEARCH_KEY_STORE_NAME)) {
        database.createObjectStore(LOCAL_SEARCH_KEY_STORE_NAME);
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export class BrowserSearchIndexStore {
  private databasePromise: Promise<IDBDatabase> | null = null;

  private getDatabase(): Promise<IDBDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = openDatabase();
    }
    return this.databasePromise;
  }

  async put(record: SearchShardRecord): Promise<void> {
    const database = await this.getDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        LOCAL_SEARCH_STORE_NAME,
        "readwrite",
      );
      transaction.objectStore(LOCAL_SEARCH_STORE_NAME).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async get(id: string): Promise<SearchShardRecord | null> {
    const database = await this.getDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(LOCAL_SEARCH_STORE_NAME, "readonly");
      const request = transaction.objectStore(LOCAL_SEARCH_STORE_NAME).get(id);
      request.onsuccess = () =>
        resolve((request.result as SearchShardRecord) ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(id: string): Promise<void> {
    const database = await this.getDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        LOCAL_SEARCH_STORE_NAME,
        "readwrite",
      );
      transaction.objectStore(LOCAL_SEARCH_STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getOrCreateKey(): Promise<CryptoKey> {
    const database = await this.getDatabase();
    const existing = await new Promise<CryptoKey | null>((resolve, reject) => {
      const transaction = database.transaction(
        LOCAL_SEARCH_KEY_STORE_NAME,
        "readonly",
      );
      const request = transaction
        .objectStore(LOCAL_SEARCH_KEY_STORE_NAME)
        .get(TITLE_INDEX_KEY_ID);
      request.onsuccess = () =>
        resolve((request.result as CryptoKey | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });

    if (existing) return existing;

    const key = await generateLocalSearchIndexKey();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        LOCAL_SEARCH_KEY_STORE_NAME,
        "readwrite",
      );
      transaction.objectStore(LOCAL_SEARCH_KEY_STORE_NAME).put(key, TITLE_INDEX_KEY_ID);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    return key;
  }
}

export const TITLE_INDEX_SHARD_ID = TITLE_INDEX_RECORD_ID;

export function titleIndexAdditionalData(accountId: string): string {
  return `title:${accountId}`;
}

export function clearLocalSearchIndexDatabase(): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(LOCAL_SEARCH_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Local private search index database is busy."));
  });
}
