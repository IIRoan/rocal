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

import { healAuthStorageAtBoot } from "./boot-heal";
import { AUTH_STORAGE_PREFIX } from "./constants";

const COOKIE_KEY = `${AUTH_STORAGE_PREFIX}_cookie`;

describe("boot-heal", () => {
  beforeEach(() => {
    mockStore.clear();
  });

  it("flattens legacy digit chunk meta before Better Auth reads the jar", () => {
    const jar = JSON.stringify({
      "__Secure-better-auth.session_token": {
        value: "tok",
        expires: null,
      },
    });
    mockStore.set(COOKIE_KEY, "1");
    mockStore.set(`${COOKIE_KEY}_0`, jar);

    healAuthStorageAtBoot();

    expect(mockStore.get(COOKIE_KEY)).toBe(jar);
    expect(mockStore.has(`${COOKIE_KEY}_0`)).toBe(false);
  });

  it("clears corrupt legacy chunk meta that would crash startup", () => {
    mockStore.set(COOKIE_KEY, "1");

    healAuthStorageAtBoot();

    expect(mockStore.has(COOKIE_KEY)).toBe(false);
  });

  it("leaves Better Auth chunk markers untouched", () => {
    mockStore.set(COOKIE_KEY, "\u0001ba-chunks:1");
    mockStore.set(`${COOKIE_KEY}.0`, '{"ok":true}');

    healAuthStorageAtBoot();

    expect(mockStore.get(COOKIE_KEY)).toBe("\u0001ba-chunks:1");
  });
});
