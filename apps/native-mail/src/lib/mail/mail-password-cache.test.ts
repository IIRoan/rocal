import { activateSessionData, closeSessionData } from "@workspace/native-core/lib/session-data-lifecycle";
/**
 * Tests for mail-password-cache.ts
 */

import { clearMailVaultPassword, saveCachedPrivateKey, clearCachedPrivateKey } from "./mail-password-cache";
import * as SecureStore from "expo-secure-store";

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  }),
}));

const mockSecureStore: Record<string, string> = {};

jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStore[key] = value;
  }),
  getItemAsync: jest.fn(async (key: string) => mockSecureStore[key] ?? null),
  deleteItemAsync: jest.fn(async (key: string) => {
    delete mockSecureStore[key];
  }),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("mail-password-cache", () => {
  beforeEach(() => {
    activateSessionData("u1");
    jest.clearAllMocks();
    Object.keys(mockSecureStore).forEach((k) => delete mockSecureStore[k]);
  });

  describe("clearMailVaultPassword", () => {
    it("deletes the password from SecureStore", async () => {
      mockSecureStore["MAIL_VAULT_PASSWORD"] = "pw";
      await clearMailVaultPassword();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
        "MAIL_VAULT_PASSWORD",
      );
    });

    it("does not throw if SecureStore fails", async () => {
      (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(
        new Error("SecureStore unavailable"),
      );
      await expect(clearMailVaultPassword()).resolves.toBeUndefined();
    });
  });
});

describe("private key cache lifetime", () => {
  beforeEach(async () => { await clearCachedPrivateKey(); activateSessionData("u1"); jest.clearAllMocks(); });

  it("does not retain a private key whose SecureStore write completed after close", async () => {
    let enter = () => undefined as void; let finish = () => undefined as void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const released = new Promise<void>((resolve) => { finish = resolve; });
    jest.mocked(SecureStore.setItemAsync).mockImplementationOnce(async (key, value) => { enter(); await released; mockSecureStore[key] = value; });
    const pending = saveCachedPrivateKey("synthetic private-key fixture");
    await entered;
    const closing = closeSessionData();
    finish();
    await Promise.all([pending, closing]);
    expect(Object.keys(mockSecureStore)).toHaveLength(0);
  });
});
