import * as SecureStore from "expo-secure-store";
import { AUTH_STORAGE_PREFIX } from "./constants";

/** Matches `@better-auth/expo` storageAdapter chunking. */
const BA_CHUNK_MARKER = "\u0001ba-chunks:";
const COOKIE_STORE_KEY = `${AUTH_STORAGE_PREFIX}_cookie`;

function isLegacyChunkMeta(raw: string): boolean {
  return /^\d+$/.test(raw);
}

function isCookieJar(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Boolean(parsed) && typeof parsed === "object" && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

function deleteSecureKey(key: string): void {
  try {
    void SecureStore.deleteItemAsync(key);
  } catch {
    // Best-effort cleanup.
  }
}

function healCookieJar(baseKey: string): void {
  const raw = SecureStore.getItem(baseKey);
  if (!raw) {
    return;
  }

  if (raw.startsWith(BA_CHUNK_MARKER)) {
    return;
  }

  if (isLegacyChunkMeta(raw)) {
    const legacyChunk = SecureStore.getItem(`${baseKey}_0`);
    const baChunk = SecureStore.getItem(`${baseKey}.0`);
    const joined = legacyChunk ?? baChunk;

    if (!joined || !isCookieJar(joined)) {
      deleteSecureKey(baseKey);
      deleteSecureKey(`${baseKey}_0`);
      deleteSecureKey(`${baseKey}.0`);
      return;
    }

    SecureStore.setItem(baseKey, joined);
    deleteSecureKey(`${baseKey}_0`);
    deleteSecureKey(`${baseKey}.0`);
    return;
  }

  if (!isCookieJar(raw)) {
    deleteSecureKey(baseKey);
  }
}

/**
 * Heal corrupt auth Keychain entries before Expo Router / Better Auth load.
 * iOS Keychain can survive app delete; legacy `"1"` chunk meta makes Better
 * Auth JSON.parse a number and crash when setting cookies.
 */
export function healAuthStorageAtBoot(): void {
  try {
    healCookieJar(COOKIE_STORE_KEY);
  } catch {
    // Never block app startup.
  }
}
