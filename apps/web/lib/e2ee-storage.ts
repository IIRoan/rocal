export const E2EE_DATABASE_NAME = "solace-e2ee";
const DATABASE_VERSION = 1;
const STORE_NAME = "device-bootstrap";

export interface StoredE2eeDeviceRecord {
  userId: string;
  deviceId: string;
  publicKey: string;
  privateKey: CryptoKey;
  wrappedAccountKey: string;
  wrappedSearchKey: string;
  wrapAlgorithm: string;
  keyVersion: number;
  createdAt: string;
  updatedAt: string;
  /** Salt of the password envelope known to hold this record's account key; without it sign-out keeps the record. */
  envelopeSalt?: string;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(E2EE_DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "userId" });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open E2EE storage"));
    };
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
      reject(request.error ?? new Error("IndexedDB request failed"));
    };

    transaction.oncomplete = () => {
      database.close();
    };

    transaction.onerror = () => {
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    };
  });
}

export async function getStoredE2eeDevice(
  userId: string,
): Promise<StoredE2eeDeviceRecord | null> {
  return withStore<StoredE2eeDeviceRecord>("readonly", (store) =>
    store.get(userId),
  );
}

export async function putStoredE2eeDevice(
  record: StoredE2eeDeviceRecord,
): Promise<void> {
  await withStore("readwrite", (store) => store.put(record));
}

export async function deleteStoredE2eeDevice(userId: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(userId));
}

export async function rememberStoredDeviceEnvelopeSalt(
  userId: string,
  deviceId: string,
  envelopeSalt: string | null,
): Promise<void> {
  const record = await getStoredE2eeDevice(userId);
  if (
    record?.deviceId === deviceId &&
    (record.envelopeSalt ?? null) !== envelopeSalt
  ) {
    await putStoredE2eeDevice({
      ...record,
      envelopeSalt: envelopeSalt ?? undefined,
    });
  }
}

/** Sign-out keeps a device key no password envelope is known to hold, since it may be the only copy of the account key. */
export async function deleteRecoverableE2eeDevices(): Promise<void> {
  const records = await withStore<StoredE2eeDeviceRecord[]>("readonly", (store) =>
    store.getAll(),
  );
  await Promise.all(
    (records ?? [])
      .filter((record) => record.envelopeSalt)
      .map((record) => deleteStoredE2eeDevice(record.userId)),
  );
}
