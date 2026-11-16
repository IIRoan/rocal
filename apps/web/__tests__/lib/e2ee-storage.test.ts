import { afterEach, beforeEach, expect, it } from "@jest/globals";
import {
  markStoredEventContentBound,
  rememberStoredDeviceEnvelopeSalt,
} from "@/lib/e2ee-storage";

type FakeRequest = { result: unknown; onsuccess: (() => void) | null; onupgradeneeded: (() => void) | null };

let disk = new Map<string, Record<string, unknown>>();
let writeLock: Promise<void> = Promise.resolve();
const previous = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");

function request(): FakeRequest {
  return { result: undefined, onsuccess: null, onupgradeneeded: null };
}

/** Readwrite transactions run one at a time, like IndexedDB's scope locking; reads see committed data. */
function transaction(_store: string, mode: IDBTransactionMode) {
  let release = () => {};
  const ready = mode === "readwrite" ? writeLock : Promise.resolve();
  if (mode === "readwrite") writeLock = new Promise((resolve) => (release = resolve));
  let pending = 0;
  const tx = {
    oncomplete: null as (() => void) | null,
    onerror: null as (() => void) | null,
    onabort: null as (() => void) | null,
    objectStore: () => store,
  };
  const settle = () =>
    setTimeout(() => {
      if (pending > 0) return;
      release();
      tx.oncomplete?.();
    }, 0);
  const run = (operation: () => unknown) => {
    const result = request();
    pending += 1;
    ready
      .then(() => new Promise((resolve) => setTimeout(resolve, 0)))
      .then(() => {
        result.result = operation();
        result.onsuccess?.();
        pending -= 1;
        settle();
      });
    return result;
  };
  const store = {
    get: (key: string) => run(() => structuredClone(disk.get(key))),
    put: (value: Record<string, unknown>) => run(() => disk.set(String(value.userId), structuredClone(value))),
  };
  return tx;
}

beforeEach(() => {
  disk = new Map([["user-1", { userId: "user-1", deviceId: "device-1" }]]);
  writeLock = Promise.resolve();
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: {
      open() {
        const result = request();
        queueMicrotask(() => {
          result.result = { close() {}, transaction };
          result.onsuccess?.();
        });
        return result;
      },
    },
  });
});

afterEach(() => {
  if (previous) Object.defineProperty(globalThis, "indexedDB", previous);
  else Reflect.deleteProperty(globalThis, "indexedDB");
});

it("keeps both concurrent updates of the device record", async () => {
  await Promise.all([
    rememberStoredDeviceEnvelopeSalt("user-1", "device-1", "salt"),
    markStoredEventContentBound("user-1"),
  ]);

  expect(disk.get("user-1")).toEqual({
    userId: "user-1",
    deviceId: "device-1",
    envelopeSalt: "salt",
    eventContentBound: true,
  });
});
