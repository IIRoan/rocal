const LOCAL_SEARCH_DB_NAME = "solace-private-search";
const LOCAL_SEARCH_STORE_NAME = "encrypted-shards";
const LOCAL_SEARCH_DB_VERSION = 1;
const AES_GCM_ALGORITHM = "AES-GCM";
const IV_BYTES = 12;

export type EncryptedSearchShard = {
  version: 1;
  algorithm: "AES-GCM";
  iv: string;
  ciphertext: string;
  updatedAt: string;
  itemCount: number;
};

export type SearchShardRecord = {
  id: string;
  source: "calendar" | "mail";
  accountId: string;
  shard: EncryptedSearchShard;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function generateLocalSearchIndexKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: AES_GCM_ALGORITHM, length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSearchShard<T>(
  key: CryptoKey,
  value: T,
  options: { additionalData?: string; itemCount?: number } = {},
): Promise<EncryptedSearchShard> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encoded = textEncoder.encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: AES_GCM_ALGORITHM,
      iv,
      ...(options.additionalData
        ? { additionalData: textEncoder.encode(options.additionalData) }
        : {}),
    },
    key,
    encoded,
  );

  return {
    version: 1,
    algorithm: "AES-GCM",
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    updatedAt: new Date().toISOString(),
    itemCount: options.itemCount ?? 0,
  };
}

export async function decryptSearchShard<T>(
  key: CryptoKey,
  shard: EncryptedSearchShard,
  options: { additionalData?: string } = {},
): Promise<T> {
  if (shard.algorithm !== AES_GCM_ALGORITHM || shard.version !== 1) {
    throw new Error("Unsupported local search shard format.");
  }

  const plaintext = await crypto.subtle.decrypt(
    {
      name: AES_GCM_ALGORITHM,
      iv: base64UrlToBytes(shard.iv),
      ...(options.additionalData
        ? { additionalData: textEncoder.encode(options.additionalData) }
        : {}),
    },
    key,
    base64UrlToBytes(shard.ciphertext),
  );

  return JSON.parse(textDecoder.decode(plaintext)) as T;
}

export class BrowserSearchIndexStore {
  private databasePromise: Promise<IDBDatabase> | null = null;

  private getDatabase(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined") {
      return Promise.reject(
        new Error("Local private search index storage is unavailable."),
      );
    }

    if (this.databasePromise) return this.databasePromise;

    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(
        LOCAL_SEARCH_DB_NAME,
        LOCAL_SEARCH_DB_VERSION,
      );

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(LOCAL_SEARCH_STORE_NAME)) {
          database.createObjectStore(LOCAL_SEARCH_STORE_NAME, { keyPath: "id" });
        }
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

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
      request.onsuccess = () => resolve((request.result as SearchShardRecord) ?? null);
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
