const DATABASE_NAME = "solace-mail";
const DATABASE_VERSION = 2;
const VAULT_BACKUP_STORE = "vault-backups";
const DERIVED_KEY_STORE = "derived-vault-keys";

/** A non-extractable CryptoKey, so page script can use the cached key but never read its bytes. */
type DerivedVaultKeyRecord = {
  userId: string;
  key: CryptoKey;
  updatedAt: string;
};

function isCryptoKey(value: unknown): value is CryptoKey {
  return typeof CryptoKey !== "undefined" && value instanceof CryptoKey;
}

async function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") {
    return null;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(VAULT_BACKUP_STORE)) {
        database.createObjectStore(VAULT_BACKUP_STORE, { keyPath: "email" });
      }
      if (!database.objectStoreNames.contains(DERIVED_KEY_STORE)) {
        database.createObjectStore(DERIVED_KEY_STORE, { keyPath: "userId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ??
          new Error("Failed to open the derived vault key store."),
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
    const transaction = database.transaction(DERIVED_KEY_STORE, mode);
    const store = transaction.objectStore(DERIVED_KEY_STORE);
    const request = callback(store);

    request.onsuccess = () => {
      resolve((request.result as T | undefined) ?? null);
    };
    request.onerror = () => {
      reject(
        request.error ??
          new Error("Derived vault key IndexedDB request failed."),
      );
    };
    transaction.oncomplete = () => {
      database.close();
    };
    transaction.onerror = () => {
      reject(
        transaction.error ??
          new Error("Derived vault key IndexedDB transaction failed."),
      );
    };
  });
}

export async function getStoredDerivedVaultKey(
  userId: string,
): Promise<CryptoKey | null> {
  const normalized = userId.trim();
  if (!normalized) return null;
  const record = await withStore<{ key?: unknown }>("readonly", (store) =>
    store.get(normalized),
  );
  if (isCryptoKey(record?.key)) return record.key;
  // Earlier builds stored the raw key bytes here; dropping them costs one Argon2id pass.
  if (record) await deleteStoredDerivedVaultKey(normalized);
  return null;
}

export async function putStoredDerivedVaultKey(
  userId: string,
  key: CryptoKey,
): Promise<void> {
  const normalized = userId.trim();
  if (!normalized || key.extractable) return;
  await withStore("readwrite", (store) =>
    store.put({
      userId: normalized,
      key,
      updatedAt: new Date().toISOString(),
    } satisfies DerivedVaultKeyRecord),
  );
}

export async function deleteStoredDerivedVaultKey(
  userId: string,
): Promise<void> {
  const normalized = userId.trim();
  if (!normalized) return;
  await withStore("readwrite", (store) => store.delete(normalized));
}
