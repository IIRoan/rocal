import { invalidatePrivateSearch } from "./private-index-lifecycle";
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

const stores = new Set<BrowserSearchIndexStore>();
let generation = 0;
let operations: Promise<unknown> = Promise.resolve();
let cleanupPending = false;

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = operations.then(operation);
  operations = result.catch(() => undefined);
  return result;
}

function openDatabase(onClose: () => void): Promise<IDBDatabase> {
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
    request.onsuccess = () => {
      const database = request.result;
      // Sign-out in another tab deletes this database; holding it open would block the next sign-in's index.
      database.onversionchange = () => {
        database.close();
        onClose();
      };
      resolve(database);
    };
  });
}

export class BrowserSearchIndexStore {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor() {
    stores.add(this);
  }

  async close(): Promise<void> {
    const pending = this.databasePromise;
    this.databasePromise = null;
    if (pending) (await pending).close();
  }

  private getDatabase(): Promise<IDBDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = openDatabase(() => {
        this.databasePromise = null;
        generation += 1;
        invalidatePrivateSearch();
      }).catch((error: unknown) => {
        this.databasePromise = null;
        throw error;
      });
    }
    return this.databasePromise;
  }

  private async putRecord(record: SearchShardRecord): Promise<void> {
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

  private async getRecord(id: string): Promise<SearchShardRecord | null> {
    const database = await this.getDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(LOCAL_SEARCH_STORE_NAME, "readonly");
      const request = transaction.objectStore(LOCAL_SEARCH_STORE_NAME).get(id);
      request.onsuccess = () =>
        resolve((request.result as SearchShardRecord) ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  private async deleteRecord(id: string): Promise<void> {
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

  private async createKey(): Promise<CryptoKey> {
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
  private run<T>(operation: () => Promise<T>): Promise<T> {
    const startedAt = generation;
    return serialize(async () => {
      if (startedAt !== generation)
        throw new Error("Private search was cancelled.");
      if (cleanupPending) await deleteIndexDatabase();
      return operation();
    });
  }

  put(record: SearchShardRecord): Promise<void> {
    return this.run(() => this.putRecord(record));
  }
  get(id: string): Promise<SearchShardRecord | null> {
    return this.run(() => this.getRecord(id));
  }
  delete(id: string): Promise<void> {
    return this.run(() => this.deleteRecord(id));
  }
  getOrCreateKey(): Promise<CryptoKey> {
    return this.run(() => this.createKey());
  }
  readKey(): Promise<CryptoKey | null> {
    return this.run(async () => {
      const database = await this.getDatabase();
      return new Promise<CryptoKey | null>((resolve, reject) => {
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
    });
  }
}

export const TITLE_INDEX_SHARD_ID = TITLE_INDEX_RECORD_ID;

export function titleIndexAdditionalData(accountId: string): string {
  return `title:${accountId}`;
}

async function deleteIndexDatabase(): Promise<void> {
  await Promise.allSettled([...stores].map((store) => store.close()));
  if (typeof indexedDB === "undefined") {
    cleanupPending = false;
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(LOCAL_SEARCH_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Local private search index database is busy."));
  });
  cleanupPending = false;
}

export function clearLocalSearchIndexDatabase(): Promise<void> {
  invalidatePrivateSearch();
  generation += 1;
  cleanupPending = true;
  return serialize(deleteIndexDatabase);
}
