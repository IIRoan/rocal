/**
 * Tests for mail-password-cache.ts
 */

import { clearMailVaultPassword } from "./mail-password-cache";

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
