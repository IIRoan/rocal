import { describe, expect, it, beforeEach } from "@jest/globals";

const mockStore = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  getItem: (key: string) => mockStore.get(key) ?? null,
  setItem: (key: string, value: string) => {
    mockStore.set(key, value);
  },
  getItemAsync: async (key: string) => mockStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    mockStore.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    mockStore.delete(key);
  },
}));

import {
  authSecureStore,
  getChunkedSecureValueSync,
  readChunkedSecureValue,
  writeChunkedSecureValue,
} from "./secure-store-chunked";

describe("secure-store-chunked", () => {
  beforeEach(() => {
    mockStore.clear();
  });

  it("reads Better Auth CHUNK_MARKER values used by the expo client", () => {
    const payload = JSON.stringify({
      "__Secure-better-auth.session_token": {
        value: "tok",
        expires: null,
      },
    });
    mockStore.set("solace_cookie", "\u0001ba-chunks:1");
    mockStore.set("solace_cookie.0", payload);

    expect(getChunkedSecureValueSync("solace_cookie")).toBe(payload);
  });

  it("reads legacy underscore chunk values", () => {
    mockStore.set("solace_cookie", "1");
    mockStore.set("solace_cookie_0", '{"a":1}');
    expect(getChunkedSecureValueSync("solace_cookie")).toBe('{"a":1}');
  });

  it("returns null for incomplete legacy chunks instead of throwing", () => {
    mockStore.set("solace_cookie", "1");
    expect(getChunkedSecureValueSync("solace_cookie")).toBeNull();
  });

  it("authSecureStore never surfaces a bare digit jar to Better Auth", () => {
    const payload = JSON.stringify({
      "__Secure-better-auth.session_token": {
        value: "tok",
        expires: null,
      },
    });
    mockStore.set("solace_cookie", "1");
    mockStore.set("solace_cookie_0", payload);

    expect(authSecureStore.getItem("solace_cookie")).toBe(payload);
    expect(() => {
      const parsed = JSON.parse(authSecureStore.getItem("solace_cookie")!);
      parsed["__Secure-better-auth.session_token"] = {
        value: "next",
        expires: null,
      };
    }).not.toThrow();
  });

  it("authSecureStore leaves Better Auth chunk markers for the expo adapter", () => {
    mockStore.set("solace_cookie", "\u0001ba-chunks:1");
    mockStore.set("solace_cookie.0", '{"ok":true}');
    expect(authSecureStore.getItem("solace_cookie")).toBe("\u0001ba-chunks:1");
  });

  it("authSecureStore setItem clears leftover legacy underscore chunks", () => {
    mockStore.set("solace_cookie", "1");
    mockStore.set("solace_cookie_0", '{"stale":true}');

    authSecureStore.setItem("solace_cookie", '{"ok":true}');

    expect(mockStore.get("solace_cookie")).toBe('{"ok":true}');
  });

  it("authSecureStore setItem keeps a session token when Better Auth writes a wiped jar", () => {
    const payload = JSON.stringify({
      "__Secure-better-auth.session_token": {
        value: "tok",
        expires: null,
      },
    });
    mockStore.set("solace_cookie", payload);

    authSecureStore.setItem(
      "solace_cookie",
      JSON.stringify({ "solace-passkey-step-up": { value: "verified", expires: null } }),
    );

    const written = JSON.parse(mockStore.get("solace_cookie")!);
    expect(written["__Secure-better-auth.session_token"]?.value).toBe("tok");
  });

  it("writes small values as plain strings Better Auth can read", async () => {
    await writeChunkedSecureValue("solace_cookie", '{"ok":true}');
    expect(mockStore.get("solace_cookie")).toBe('{"ok":true}');
    await expect(readChunkedSecureValue("solace_cookie")).resolves.toBe(
      '{"ok":true}',
    );
  });
});
