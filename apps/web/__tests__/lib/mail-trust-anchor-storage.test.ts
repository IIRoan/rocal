import { afterEach, beforeEach, expect, it } from "@jest/globals";
import {
  clearMailTrustAnchors,
  readMailTrustAnchor,
  writeMailTrustAnchor,
} from "@/lib/mail/mail-trust-anchor-storage";

let disk = new Map<string, string>();
let pausePut: (() => Promise<void>) | null = null;
const previous = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
type FakeRequest = {
  result: unknown;
  onsuccess: (() => void) | null;
  onupgradeneeded: (() => void) | null;
  onerror: (() => void) | null;
  onblocked: (() => void) | null;
};
function request(): FakeRequest {
  return {
    result: undefined,
    onsuccess: null,
    onupgradeneeded: null,
    onerror: null,
    onblocked: null,
  };
}
const database = {
  createObjectStore() {},
  close() {},
  transaction() {
    const tx = {
      oncomplete: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onabort: null as (() => void) | null,
      objectStore: () => ({
        get(key: string) {
          const result = request();
          queueMicrotask(() => {
            result.result = disk.get(key);
            result.onsuccess?.();
            tx.oncomplete?.();
          });
          return result;
        },
        put(value: string, key: string) {
          const result = request();
          queueMicrotask(() => {
            const run = async () => {
              await pausePut?.();
              disk.set(key, value);
              result.result = key;
              result.onsuccess?.();
              tx.oncomplete?.();
            };
            run().catch(() => tx.onerror?.());
          });
          return result;
        },
      }),
    };
    return tx;
  },
};
beforeEach(() => {
  disk = new Map();
  pausePut = null;
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: {
      open() {
        const result = request();
        queueMicrotask(() => {
          result.result = database;
          result.onupgradeneeded?.();
          result.onsuccess?.();
        });
        return result;
      },
      deleteDatabase() {
        const result = request();
        queueMicrotask(() => {
          disk.clear();
          result.onsuccess?.();
        });
        return result;
      },
    },
  });
});
afterEach(async () => {
  await clearMailTrustAnchors();
  if (previous) Object.defineProperty(globalThis, "indexedDB", previous);
  else Reflect.deleteProperty(globalThis, "indexedDB");
});
it("serializes an IndexedDB clear after a transaction that physically commits during sign-out", async () => {
  let entered: (() => void) | undefined;
  let resume: (() => void) | undefined;
  let active = true;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const paused = new Promise<void>((resolve) => {
    resume = resolve;
  });
  pausePut = async () => {
    entered?.();
    await paused;
  };
  const write = writeMailTrustAnchor(
    "opaque-a",
    "SYNTHETIC-ciphertext",
    () => active,
  );
  const rejected = expect(write).rejects.toThrow("session changed");
  await started;
  active = false;
  const clear = clearMailTrustAnchors();
  resume?.();
  await rejected;
  await clear;
  expect(disk.size).toBe(0);
});
it("isolates opaque account records and refuses stale writes", async () => {
  await writeMailTrustAnchor("opaque-a", "SYNTHETIC-a", () => true);
  expect(await readMailTrustAnchor("opaque-a", () => true)).toBe("SYNTHETIC-a");
  expect(await readMailTrustAnchor("opaque-b", () => true)).toBeNull();
  await expect(
    writeMailTrustAnchor("opaque-b", "SYNTHETIC-b", () => false),
  ).rejects.toThrow("session changed");
  expect(disk.has("opaque-b")).toBe(false);
});

it("does not allow a new anchor write to skip a failed physical wipe", async () => {
  await writeMailTrustAnchor("opaque-a", "SYNTHETIC-a", () => true);
  let attempts = 0;
  Object.defineProperty(indexedDB, "deleteDatabase", {
    value: () => {
      const result = request();
      queueMicrotask(() => {
        attempts += 1;
        if (attempts === 1) result.onerror?.();
        else {
          disk.clear();
          result.onsuccess?.();
        }
      });
      return result;
    },
  });
  await expect(clearMailTrustAnchors()).rejects.toThrow("could not be cleared");
  await writeMailTrustAnchor("opaque-b", "SYNTHETIC-b", () => true);
  expect(attempts).toBe(2);
  expect(disk.has("opaque-a")).toBe(false);
  expect(disk.get("opaque-b")).toBe("SYNTHETIC-b");
});
