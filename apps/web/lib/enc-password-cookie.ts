/**
 * Encrypted password cookie — shared across calendar and mail.
 *
 * The password (used to derive both calendar and mail encryption keys) is
 * stored in a browser cookie as AES-GCM ciphertext. The symmetric key for
 * that encryption is kept in localStorage, so the cookie cannot be decrypted
 * without also having the device key. Both are cleared on sign-out.
 *
 * The module also maintains an in-memory copy so hot reads remain synchronous
 * after the async init has run.
 */

import {
  storePendingAuthPassword,
  clearAuthPasswords,
} from "./e2ee-password-cache";

const COOKIE_NAME = "solace_enc_pw";
const DEVICE_KEY_STORAGE_KEY = "solace:enc-device-key";

let _memoryPassword: string | null = null;

// ─── Device key ───────────────────────────────────────────────────────────────

async function getOrCreateDeviceKey(): Promise<CryptoKey> {
  const stored = localStorage.getItem(DEVICE_KEY_STORAGE_KEY);
  if (stored) {
    try {
      return await crypto.subtle.importKey(
        "jwk",
        JSON.parse(atob(stored)) as JsonWebKey,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"],
      );
    } catch {
      // Key record is corrupt — fall through to generate a new one.
    }
  }

  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const exported = await crypto.subtle.exportKey("jwk", key);
  localStorage.setItem(DEVICE_KEY_STORAGE_KEY, btoa(JSON.stringify(exported)));
  return key;
}

// ─── Cookie helpers ───────────────────────────────────────────────────────────

function readCookie(): string | null {
  if (typeof document === "undefined") return null;
  const entry = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${COOKIE_NAME}=`));
  return entry ? decodeURIComponent(entry.slice(COOKIE_NAME.length + 1)) : null;
}

function writeCookie(value: string): void {
  const maxAge = 30 * 24 * 60 * 60; // 30 days
  const secure =
    typeof location !== "undefined" && location.protocol === "https:"
      ? "; Secure"
      : "";
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(value)}; path=/; SameSite=Strict; max-age=${maxAge}${secure}`;
}

function expireCookie(): void {
  document.cookie = `${COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict`;
}

/**
 * Remove a persisted encryption cookie when its device key is missing.
 * This happens after manual cookie clears or browser profile resets.
 */
export function clearOrphanedEncPasswordCookie(): void {
  if (typeof window === "undefined") return;

  const cookieValue = readCookie();
  if (!cookieValue) return;

  if (!localStorage.getItem(DEVICE_KEY_STORAGE_KEY)) {
    expireCookie();
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Encrypt the password with the device key and write it to the shared cookie.
 * Also updates the in-memory cache so subsequent sync reads see the value.
 */
export async function setEncPasswordCookie(password: string): Promise<void> {
  if (typeof window === "undefined") return;

  _memoryPassword = password;

  const key = await getOrCreateDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(password),
  );

  const combined = new Uint8Array(12 + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), 12);

  writeCookie(btoa(String.fromCharCode(...combined)));
}

/**
 * Synchronous read of the in-memory cache.
 * Returns null until initEncPasswordFromCookie() has resolved.
 */
export function peekEncPassword(): string | null {
  return _memoryPassword;
}

/**
 * Decrypt the cookie using the device key and populate both the cookie module
 * memory cache and the shared auth-password memory cache (so existing callers
 * of peekCachedAuthPassword() see the value without any changes on their side).
 *
 * Safe to call multiple times — no-ops if the memory cache is already set.
 */
export async function initEncPasswordFromCookie(): Promise<void> {
  if (typeof window === "undefined") return;
  if (_memoryPassword !== null) return;

  const cookieValue = readCookie();
  if (!cookieValue) return;

  if (!localStorage.getItem(DEVICE_KEY_STORAGE_KEY)) {
    expireCookie();
    return;
  }

  try {
    const key = await getOrCreateDeviceKey();
    const combined = Uint8Array.from(atob(cookieValue), (c) => c.charCodeAt(0));
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: combined.slice(0, 12) },
      key,
      combined.slice(12),
    );
    const password = new TextDecoder().decode(decrypted);
    _memoryPassword = password;
    // Populate the shared auth-password memory cache so peekCachedAuthPassword()
    // works without needing any changes in calendar/mail bootstrap code.
    storePendingAuthPassword(password);
  } catch {
    // Cookie or device key is corrupt/mismatched — clean up.
    clearEncPasswordCookie();
  }
}

/**
 * Remove the cookie, the device key, and the in-memory cache.
 * Also clears the shared auth-password memory cache via clearAuthPasswords().
 * Call this on every sign-out path.
 */
export function clearEncPasswordCookie(): void {
  _memoryPassword = null;
  if (typeof window === "undefined") return;
  expireCookie();
  localStorage.removeItem(DEVICE_KEY_STORAGE_KEY);
  clearAuthPasswords();
}
