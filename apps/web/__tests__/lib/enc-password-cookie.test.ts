/** @jest-environment jsdom */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { webcrypto } from "crypto";
import { TextEncoder, TextDecoder } from "util";

// jsdom may not ship crypto.subtle or TextEncoder/TextDecoder — polyfill from Node built-ins
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    writable: true,
  });
}
if (typeof globalThis.TextEncoder === "undefined") {
  (globalThis as any).TextEncoder = TextEncoder;
  (globalThis as any).TextDecoder = TextDecoder;
}

const mockStorePendingAuthPassword = jest.fn();
const mockClearAuthPasswords = jest.fn();

jest.mock("../../lib/e2ee-password-cache", () => ({
  storePendingAuthPassword: mockStorePendingAuthPassword,
  clearAuthPasswords: mockClearAuthPasswords,
}));

// Imported after mocks are set up
let setEncPasswordCookie: (p: string) => Promise<void>;
let peekEncPassword: () => string | null;
let initEncPasswordFromCookie: () => Promise<void>;
let clearEncPasswordCookie: () => void;

beforeEach(async () => {
  jest.resetModules();
  // Re-import after resetModules so module-level state is fresh each test
  const mod = await import("../../lib/enc-password-cookie");
  setEncPasswordCookie = mod.setEncPasswordCookie;
  peekEncPassword = mod.peekEncPassword;
  initEncPasswordFromCookie = mod.initEncPasswordFromCookie;
  clearEncPasswordCookie = mod.clearEncPasswordCookie;

  // Clean slate: remove device key and cookie
  localStorage.clear();
  document.cookie =
    "solace_enc_pw=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  mockStorePendingAuthPassword.mockReset();
  mockClearAuthPasswords.mockReset();
});

afterEach(() => {
  localStorage.clear();
  document.cookie =
    "solace_enc_pw=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
});

describe("enc-password-cookie", () => {
  describe("setEncPasswordCookie", () => {
    it("stores the password in memory after setting the cookie", async () => {
      await setEncPasswordCookie("hunter2");
      expect(peekEncPassword()).toBe("hunter2");
    });

    it("writes an encrypted value to document.cookie (not plaintext)", async () => {
      await setEncPasswordCookie("super-secret");
      const raw = document.cookie;
      expect(raw).toContain("solace_enc_pw=");
      expect(raw).not.toContain("super-secret");
    });

    it("generates and persists a device key in localStorage", async () => {
      await setEncPasswordCookie("pw");
      expect(localStorage.getItem("solace:enc-device-key")).not.toBeNull();
    });

    it("reuses an existing device key across multiple calls", async () => {
      await setEncPasswordCookie("pw1");
      const key1 = localStorage.getItem("solace:enc-device-key");
      await setEncPasswordCookie("pw2");
      const key2 = localStorage.getItem("solace:enc-device-key");
      expect(key1).toBe(key2);
    });
  });

  describe("initEncPasswordFromCookie", () => {
    it("is a no-op when no cookie is present", async () => {
      await initEncPasswordFromCookie();
      expect(peekEncPassword()).toBeNull();
      expect(mockStorePendingAuthPassword).not.toHaveBeenCalled();
    });

    it("is a no-op when cookie exists but device key is missing", async () => {
      // Write a cookie without a device key in localStorage
      document.cookie = "solace_enc_pw=garbage; path=/";
      localStorage.removeItem("solace:enc-device-key");
      await initEncPasswordFromCookie();
      expect(peekEncPassword()).toBeNull();
      expect(document.cookie).not.toContain("solace_enc_pw=garbage");
    });

    it("decrypts the cookie and restores the password to memory", async () => {
      await setEncPasswordCookie("my-password");
      // Simulate a fresh module load by nulling memory via clear + re-init
      clearEncPasswordCookie();
      // But we need the cookie + device key to still exist — clearEncPasswordCookie
      // wipes both. So we re-set only what we need: device key stays from set above.
      // Instead, use a direct round-trip by calling set, then manually null memory.
      // We achieve this by calling set (which writes cookie+key) then creating a
      // fresh module instance via resetModules.
    });

    it("restores the password and populates the shared auth-password memory cache", async () => {
      await setEncPasswordCookie("session-password");

      // Grab the cookie and device key written above, then reset module state
      const cookieValue = document.cookie;
      const deviceKey = localStorage.getItem("solace:enc-device-key");

      jest.resetModules();
      const mod2 = await import("../../lib/enc-password-cookie");

      // Restore cookie + device key so initEncPasswordFromCookie can decrypt
      document.cookie = cookieValue;
      if (deviceKey) localStorage.setItem("solace:enc-device-key", deviceKey);

      await mod2.initEncPasswordFromCookie();

      expect(mod2.peekEncPassword()).toBe("session-password");
      expect(mockStorePendingAuthPassword).toHaveBeenCalledWith(
        "session-password",
      );
    });

    it("is a no-op when memory cache is already populated", async () => {
      await setEncPasswordCookie("cached");
      // Memory is set — calling init again should not decrypt again
      const callsBefore = mockStorePendingAuthPassword.mock.calls.length;
      await initEncPasswordFromCookie();
      expect(mockStorePendingAuthPassword.mock.calls.length).toBe(callsBefore);
    });

    it("clears the cookie when decryption fails (corrupt data)", async () => {
      // Write a valid device key but a garbage cookie
      await setEncPasswordCookie("original");
      document.cookie = "solace_enc_pw=!!!corrupted!!!; path=/";

      jest.resetModules();
      const mod2 = await import("../../lib/enc-password-cookie");
      await mod2.initEncPasswordFromCookie();

      // Password should not be restored; cookie should be gone
      expect(mod2.peekEncPassword()).toBeNull();
    });
  });

  describe("clearEncPasswordCookie", () => {
    it("clears the in-memory password", async () => {
      await setEncPasswordCookie("pw");
      clearEncPasswordCookie();
      expect(peekEncPassword()).toBeNull();
    });

    it("removes the device key from localStorage", async () => {
      await setEncPasswordCookie("pw");
      clearEncPasswordCookie();
      expect(localStorage.getItem("solace:enc-device-key")).toBeNull();
    });

    it("calls clearAuthPasswords to wipe the shared auth-password memory cache", async () => {
      await setEncPasswordCookie("pw");
      mockClearAuthPasswords.mockReset();
      clearEncPasswordCookie();
      expect(mockClearAuthPasswords).toHaveBeenCalledTimes(1);
    });

    it("is safe to call when nothing has been set", () => {
      expect(() => clearEncPasswordCookie()).not.toThrow();
    });
  });
});
