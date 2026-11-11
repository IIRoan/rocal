export const MAIL_TRUST_DATABASE_NAME = "solace-mail-trust";
const STORE = "anchors";
let generation = 0;
let cleanupPending = false;
let tail: Promise<unknown> = Promise.resolve();

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = tail.then(operation);
  tail = result.catch(() => undefined);
  return result;
}
function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined")
    return Promise.reject(
      new Error("Local encryption-key history is unavailable."),
    );
  return new Promise((resolve, reject) => {
    let failed = false;
    const request = indexedDB.open(MAIL_TRUST_DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => {
      if (failed) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => {
      failed = true;
      reject(new Error("Local encryption-key history is unavailable."));
    };
    request.onblocked = () => {
      failed = true;
      reject(new Error("Local encryption-key history is busy."));
    };
  });
}
async function transaction(
  accountId: string,
  isCurrent: () => boolean,
  ciphertext?: string,
): Promise<string | null> {
  const epoch = generation;
  const current = () => epoch === generation && isCurrent();
  return serialize(async () => {
    if (!current()) throw new Error("Mail encryption session changed.");
    if (cleanupPending) await deleteStore(generation);
    if (!current()) throw new Error("Mail encryption session changed.");
    const database = await open();
    if (!current()) {
      database.close();
      throw new Error("Mail encryption session changed.");
    }
    return new Promise((resolve, reject) => {
      const tx = database.transaction(
        STORE,
        ciphertext === undefined ? "readonly" : "readwrite",
      );
      const store = tx.objectStore(STORE);
      const request =
        ciphertext === undefined
          ? store.get(accountId)
          : store.put(ciphertext, accountId);
      let result: unknown = null;
      request.onsuccess = () => {
        result = request.result;
      };
      tx.oncomplete = () => {
        database.close();
        if (!current()) {
          reject(new Error("Mail encryption session changed."));
          return;
        }
        if (ciphertext !== undefined) {
          resolve(ciphertext);
          return;
        }
        if (typeof result === "string") resolve(result);
        else if (result === undefined || result === null) resolve(null);
        else reject(new Error("Local encryption-key history is unreadable."));
      };
      tx.onerror = tx.onabort = () => {
        database.close();
        reject(new Error("Local encryption-key history is unavailable."));
      };
    });
  });
}
export function readMailTrustAnchor(
  accountId: string,
  isCurrent: () => boolean,
): Promise<string | null> {
  return transaction(accountId, isCurrent);
}
export async function writeMailTrustAnchor(
  accountId: string,
  ciphertext: string,
  isCurrent: () => boolean,
): Promise<void> {
  await transaction(accountId, isCurrent, ciphertext);
}
function deleteStore(epoch: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      if (epoch === generation) cleanupPending = false;
      resolve();
      return;
    }
    const request = indexedDB.deleteDatabase(MAIL_TRUST_DATABASE_NAME);
    request.onsuccess = () => {
      if (epoch === generation) cleanupPending = false;
      resolve();
    };
    request.onerror = request.onblocked = () =>
      reject(new Error("Local encryption-key history could not be cleared."));
  });
}
export function clearMailTrustAnchors(): Promise<void> {
  const epoch = ++generation;
  cleanupPending = true;
  return serialize(() => deleteStore(epoch));
}
