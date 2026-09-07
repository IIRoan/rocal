import type { MailVaultBackupRecord } from "./types";

const DATABASE_NAME = "solace-mail";
/** Bumped to 2 so derived-vault-keys can share this DB (see derived-vault-key-storage). */
const DATABASE_VERSION = 2;
const STORE_NAME = "vault-backups";
const DERIVED_KEY_STORE = "derived-vault-keys";

async function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") {
    return null;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "email" });
      }
      if (!database.objectStoreNames.contains(DERIVED_KEY_STORE)) {
        database.createObjectStore(DERIVED_KEY_STORE, { keyPath: "userId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ?? new Error("Failed to open the mail vault store."),
      );
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const database = await openDatabase();

  if (!database) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = callback(store);

    request.onsuccess = () => {
      resolve((request.result as T | undefined) ?? null);
    };

    request.onerror = () => {
      reject(
        request.error ?? new Error("Mail vault IndexedDB request failed."),
      );
    };

    transaction.oncomplete = () => {
      database.close();
    };

    transaction.onerror = () => {
      reject(
        transaction.error ??
          new Error("Mail vault IndexedDB transaction failed."),
      );
    };
  });
}

export async function getStoredMailVault(
  email: string,
): Promise<MailVaultBackupRecord | null> {
  return withStore<MailVaultBackupRecord>("readonly", (store) =>
    store.get(email.toLowerCase()),
  );
}

export async function putStoredMailVault(
  record: MailVaultBackupRecord,
): Promise<void> {
  await withStore("readwrite", (store) =>
    store.put({
      ...record,
      email: record.email.toLowerCase(),
    }),
  );
}

export async function deleteStoredMailVault(email: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(email.toLowerCase()));
}
