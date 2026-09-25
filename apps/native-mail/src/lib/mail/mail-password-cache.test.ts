/**
 * Tests for mail-password-cache.ts
 */

import {
  saveMailVaultPassword,
  loadMailVaultPassword,
  clearMailVaultPassword,
} from "./mail-password-cache";

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

import * as SecureStore from "expo-secure-store";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("mail-password-cache", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockSecureStore).forEach((k) => delete mockSecureStore[k]);
  });

  describe("saveMailVaultPassword", () => {
    it("writes the password to SecureStore", async () => {
      await saveMailVaultPassword("hunter2");
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        "MAIL_VAULT_PASSWORD",
        "hunter2",
      );
    });

    it("is a no-op for empty strings", async () => {
      await saveMailVaultPassword("");
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    });

    it("does not throw if SecureStore fails", async () => {
      (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(
        new Error("SecureStore unavailable"),
      );
      await expect(saveMailVaultPassword("pw")).resolves.toBeUndefined();
    });
  });

  describe("loadMailVaultPassword", () => {
    it("returns the stored password", async () => {
      mockSecureStore["MAIL_VAULT_PASSWORD"] = "stored-pw";
      const result = await loadMailVaultPassword();
      expect(result).toBe("stored-pw");
    });

    it("returns null when nothing is stored", async () => {
      const result = await loadMailVaultPassword();
      expect(result).toBeNull();
    });

    it("returns null and does not throw if SecureStore fails", async () => {
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(
        new Error("SecureStore unavailable"),
      );
      await expect(loadMailVaultPassword()).resolves.toBeNull();
    });
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

  describe("full lifecycle", () => {
    it("save → load → clear → load returns null", async () => {
      await saveMailVaultPassword("my-secret");
      expect(await loadMailVaultPassword()).toBe("my-secret");
      await clearMailVaultPassword();
      expect(await loadMailVaultPassword()).toBeNull();
    });
  });
});
