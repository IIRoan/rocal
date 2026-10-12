import { describe, expect, it, beforeEach } from "@jest/globals";
import {
  authSecureStore,
  deleteChunkedSecureValue,
  getChunkedSecureValueSync,
  readChunkedSecureValue,
  setChunkedSecureValueSync,
  writeChunkedSecureValue,
} from "./secure-store-chunked";

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

  it("preserves reads of older non-auth values exceeding Expo's new chunk limit", async () => {
    mockStore.set("mail-settings", "\u0001ba-chunks:101");
    for (let index = 0; index < 101; index += 1) {
      mockStore.set(`mail-settings.${index}`, "x");
    }

    expect(getChunkedSecureValueSync("mail-settings")).toBe("x".repeat(101));
    await expect(readChunkedSecureValue("mail-settings")).resolves.toBe(
      "x".repeat(101),
    );
  });

  it.each([0, 1])(
    "reads the active Expo chunk slot %i synchronously and asynchronously",
    async (slot) => {
      mockStore.set("solace_cookie", `\u0001ba-chunks:2:${slot}:1`);
      mockStore.set(`solace_cookie.${slot}.0`, '{"session_token":');
      mockStore.set(
        `solace_cookie.${slot}.1`,
        '{"value":"tok","expires":null}}',
      );
      mockStore.set(`solace_cookie.${1 - slot}.0`, '{"stale":true}');
      const payload = '{"session_token":{"value":"tok","expires":null}}';

      expect(getChunkedSecureValueSync("solace_cookie")).toBe(payload);
      await expect(readChunkedSecureValue("solace_cookie")).resolves.toBe(
        payload,
      );
      expect(authSecureStore.getItem("solace_cookie")).toBe(
        `\u0001ba-chunks:2:${slot}:1`,
      );
      await expect(authSecureStore.getItemAsync("solace_cookie")).resolves.toBe(
        `\u0001ba-chunks:2:${slot}:1`,
      );
    },
  );

  it.each([null, ""])(
    "recovers the previous Expo slot when an active chunk is %s",
    async (chunk) => {
      mockStore.set("solace_cookie", "\u0001ba-chunks:2:1:1");
      mockStore.set("solace_cookie.1.0", '{"incomplete":');
      if (chunk !== null) mockStore.set("solace_cookie.1.1", chunk);
      mockStore.set("solace_cookie.0.0", '{"previous":true}');

      expect(getChunkedSecureValueSync("solace_cookie")).toBe(
        '{"previous":true}',
      );
      await expect(readChunkedSecureValue("solace_cookie")).resolves.toBe(
        '{"previous":true}',
      );
      mockStore.delete("solace_cookie.0.0");
      expect(getChunkedSecureValueSync("solace_cookie")).toBeNull();
      await expect(readChunkedSecureValue("solace_cookie")).resolves.toBeNull();
    },
  );

  it.each(["0:0", "101:0", "1:2", "1:0:0", "1:0:101", "1:0:1:1"])(
    "rejects malformed Expo chunk metadata %s",
    async (marker) => {
      mockStore.set("solace_cookie", `\u0001ba-chunks:${marker}`);

      expect(getChunkedSecureValueSync("solace_cookie")).toBeNull();
      await expect(readChunkedSecureValue("solace_cookie")).resolves.toBeNull();
    },
  );

  it.each([
    { useAsync: false, length: 20 },
    { useAsync: true, length: 20 },
    { useAsync: false, length: 4000 },
    { useAsync: true, length: 4000 },
  ])(
    "removes both Expo slots when replacing them (async: $useAsync, length: $length)",
    async ({ useAsync, length }) => {
      mockStore.set("solace_cookie", "\u0001ba-chunks:2:1:1");
      mockStore.set("solace_cookie.1.0", "active");
      mockStore.set("solace_cookie.1.1", "slot");
      mockStore.set("solace_cookie.0.0", "previous");
      const payload = "x".repeat(length);

      if (useAsync) await writeChunkedSecureValue("solace_cookie", payload);
      else setChunkedSecureValueSync("solace_cookie", payload);

      expect(getChunkedSecureValueSync("solace_cookie")).toBe(payload);
      await expect(readChunkedSecureValue("solace_cookie")).resolves.toBe(
        payload,
      );
      expect(mockStore.has("solace_cookie.1.0")).toBe(false);
      expect(mockStore.has("solace_cookie.1.1")).toBe(false);
      expect(mockStore.has("solace_cookie.0.0")).toBe(false);
    },
  );

  it("deletes active and fallback Expo chunks during credential cleanup", async () => {
    mockStore.set("solace_cookie", "\u0001ba-chunks:2:0:1");
    mockStore.set("solace_cookie.0.0", "active");
    mockStore.set("solace_cookie.0.1", "slot");
    mockStore.set("solace_cookie.1.0", "previous");

    await deleteChunkedSecureValue("solace_cookie");

    expect(mockStore.size).toBe(0);
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
      JSON.stringify({
        "solace-passkey-step-up": { value: "verified", expires: null },
      }),
    );

    const written = JSON.parse(mockStore.get("solace_cookie")!);
    expect(written["__Secure-better-auth.session_token"]?.value).toBe("tok");
  });

  it("reads legacy cookie chunks through Better Auth's async storage API", async () => {
    mockStore.set("solace_cookie", "2");
    mockStore.set("solace_cookie_0", '{"session_token":');
    mockStore.set("solace_cookie_1", '{"value":"tok","expires":null}}');

    await expect(authSecureStore.getItemAsync("solace_cookie")).resolves.toBe(
      '{"session_token":{"value":"tok","expires":null}}',
    );
    mockStore.delete("solace_cookie_1");
    await expect(authSecureStore.getItemAsync("solace_cookie")).resolves.toBe(
      "{}",
    );
  });

  it("leaves Better Auth chunk markers to the async Expo adapter", async () => {
    mockStore.set("solace_cookie", "\u0001ba-chunks:1");
    mockStore.set("solace_cookie.0", '{"ok":true}');

    await expect(authSecureStore.getItemAsync("solace_cookie")).resolves.toBe(
      "\u0001ba-chunks:1",
    );
  });

  it("persists async cookie writes and removes legacy chunks before resolving", async () => {
    mockStore.set("solace_cookie", "2");
    mockStore.set("solace_cookie_0", '{"stale":');
    mockStore.set("solace_cookie_1", "true}");

    await authSecureStore.setItemAsync("solace_cookie", '{"ok":true}');

    await expect(authSecureStore.getItemAsync("solace_cookie")).resolves.toBe(
      '{"ok":true}',
    );
    expect(mockStore.has("solace_cookie_0")).toBe(false);
    expect(mockStore.has("solace_cookie_1")).toBe(false);
  });

  it("keeps the session token from chunked storage across async partial cookie writes", async () => {
    const session = { value: "tok", expires: null };
    mockStore.set("solace_cookie", "\u0001ba-chunks:1");
    mockStore.set(
      "solace_cookie.0",
      JSON.stringify({ "__Secure-better-auth.session_token": session }),
    );

    await authSecureStore.setItemAsync(
      "solace_cookie",
      JSON.stringify({
        "solace-passkey-step-up": { value: "verified", expires: null },
      }),
    );

    const written = mockStore.get("solace_cookie");
    expect(written && JSON.parse(written)).toEqual({
      "__Secure-better-auth.session_token": session,
      "solace-passkey-step-up": { value: "verified", expires: null },
    });
  });

  it("writes small values as plain strings Better Auth can read", async () => {
    await writeChunkedSecureValue("solace_cookie", '{"ok":true}');
    expect(mockStore.get("solace_cookie")).toBe('{"ok":true}');
    await expect(readChunkedSecureValue("solace_cookie")).resolves.toBe(
      '{"ok":true}',
    );
  });

  it.each([false, true])(
    "preserves a session token from an Expo slot during partial writes (async: %s)",
    async (useAsync) => {
      const session = { value: "tok", expires: null };
      mockStore.set("solace_cookie", "\u0001ba-chunks:1:0");
      mockStore.set(
        "solace_cookie.0.0",
        JSON.stringify({ "__Secure-better-auth.session_token": session }),
      );
      const payload = JSON.stringify({
        "solace-passkey-step-up": { value: "verified", expires: null },
      });

      if (useAsync)
        await authSecureStore.setItemAsync("solace_cookie", payload);
      else authSecureStore.setItem("solace_cookie", payload);

      const written = mockStore.get("solace_cookie");
      expect(written && JSON.parse(written)).toEqual({
        "__Secure-better-auth.session_token": session,
        "solace-passkey-step-up": { value: "verified", expires: null },
      });
    },
  );

  it.each([false, true])(
    "clears a slotted cookie jar without restoring the signed-out token (async: %s)",
    async (useAsync) => {
      mockStore.set("solace_cookie", "\u0001ba-chunks:1:0");
      mockStore.set(
        "solace_cookie.0.0",
        '{"session_token":{"value":"tok","expires":null}}',
      );

      if (useAsync) await authSecureStore.setItemAsync("solace_cookie", "{}");
      else authSecureStore.setItem("solace_cookie", "{}");

      expect(getChunkedSecureValueSync("solace_cookie")).toBe("{}");
    },
  );
});
