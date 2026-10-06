/** The password is stored AES-GCM encrypted in a cookie; its key lives in localStorage and both clear on sign-out. */

import {
  storePendingAuthPassword,
  clearAuthPasswords,
} from "./e2ee-password-cache";

const COOKIE_NAME = "solace_enc_pw";
const DEVICE_KEY_STORAGE_KEY = "solace:enc-device-key";

let _memoryPassword: string | null = null;

// ─── Device key ───────────────────────────────────────────────────────────────

function isJsonWebKey(value: unknown): value is JsonWebKey {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).kty === "string"
  );
}

async function getOrCreateDeviceKey(): Promise<CryptoKey> {
  const stored = localStorage.getItem(DEVICE_KEY_STORAGE_KEY);
  if (stored) {
    try {
      const parsed: unknown = JSON.parse(atob(stored));
      if (!isJsonWebKey(parsed)) {
        throw new Error("Corrupt device key record");
      }
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

/** Remove a persisted cookie when its device key is missing (manual clear or profile reset). */
export function clearOrphanedEncPasswordCookie(): void {
  if (typeof window === "undefined") return;

  const cookieValue = readCookie();
  if (!cookieValue) return;

  if (!localStorage.getItem(DEVICE_KEY_STORAGE_KEY)) {
    expireCookie();
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Encrypt the password with the device key, write the cookie, and update the in-memory cache. */
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

/** Synchronous in-memory read; returns null until initEncPasswordFromCookie() resolves. */
export function peekEncPassword(): string | null {
  return _memoryPassword;
}

/** Decrypt the cookie into the memory caches; no-ops once the memory cache is set. */
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
    // Populate the shared auth-password memory cache so peekCachedAuthPassword() callers need no changes.
    storePendingAuthPassword(password);
  } catch {
    // Cookie or device key is corrupt/mismatched — clean up.
    clearEncPasswordCookie();
  }
}

/** Remove cookie, device key, and memory caches; call on every sign-out path. */
export function clearEncPasswordCookie(): void {
  _memoryPassword = null;
  if (typeof window === "undefined") return;
  expireCookie();
  localStorage.removeItem(DEVICE_KEY_STORAGE_KEY);
  clearAuthPasswords();
}
