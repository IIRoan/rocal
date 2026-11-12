import { beforeEach, expect, it, jest } from "@jest/globals";
import {
  activateSessionData,
  closeSessionData,
} from "@workspace/native-core/lib/session-data-lifecycle";
import {
  readMailTrustAnchor,
  writeMailTrustAnchor,
} from "./mail-trust-anchor-storage";

let mockStored: string | null = null;
const mockWrite = jest.fn<(_key: string, value: string) => Promise<void>>();
jest.mock("@workspace/native-core/lib/constants", () => ({
  SECURE_STORE_KEYS: { MAIL_TRUST_ESTABLISHMENT: "SYNTHETIC-anchor" },
}));
jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "SYNTHETIC-this-device-only",
  getItemAsync: async () => mockStored,
  setItemAsync: (key: string, value: string) => mockWrite(key, value),
  deleteItemAsync: async () => {
    mockStored = null;
  },
}));
jest.mock("@workspace/logger", () => ({
  createLogger: () => ({ warn: jest.fn() }),
}));
beforeEach(async () => {
  await closeSessionData();
  activateSessionData("user-a");
  mockStored = null;
  mockWrite.mockReset().mockImplementation(async (_key, value) => {
    mockStored = value;
  });
});
it("wipes a native anchor even when a physical SecureStore write finishes after sign-out", async () => {
  let entered: (() => void) | undefined;
  let resume: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const paused = new Promise<void>((resolve) => {
    resume = resolve;
  });
  mockWrite.mockImplementationOnce(async (_key, value) => {
    entered?.();
    await paused;
    mockStored = value;
  });
  const pending = writeMailTrustAnchor(
    "user-a",
    "SYNTHETIC-account-ciphertext",
  );
  const rejected = expect(pending).rejects.toThrow("session changed");
  await started;
  const closed = closeSessionData();
  resume?.();
  await rejected;
  await closed;
  expect(mockStored).toBeNull();
});
it("does not expose another account's anchor and refuses work without an active scope", async () => {
  await writeMailTrustAnchor("user-a", "SYNTHETIC-a");
  activateSessionData("user-b");
  expect(await readMailTrustAnchor("user-b")).toBeNull();
  await expect(readMailTrustAnchor("user-a")).rejects.toThrow(
    "session changed",
  );
  await closeSessionData();
  await expect(writeMailTrustAnchor("user-b", "SYNTHETIC-b")).rejects.toThrow(
    "session changed",
  );
});
