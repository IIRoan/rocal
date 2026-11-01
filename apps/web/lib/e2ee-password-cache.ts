const LEGACY_PASSWORD_COOKIE = "solace_enc_pw";
const LEGACY_PASSWORD_KEY_STORAGE_KEY = "solace:enc-device-key";
const LEGACY_FRESH_SIGN_IN_KEY = "solace:enc-fresh-sign-in";

/** Memory only and never persisted: the login page opens the keys with it before it navigates away. */
let pendingAuthPassword: string | null = null;

export function storePendingAuthPassword(password: string): void {
  const trimmed = password.trim();
  pendingAuthPassword = trimmed || null;
}

export function peekPendingAuthPassword(): string | null {
  return pendingAuthPassword;
}

export function clearPendingAuthPassword(): void {
  pendingAuthPassword = null;
}

export function clearAuthPasswords(): void {
  pendingAuthPassword = null;
  clearLegacyRememberedPassword();
}

/** Earlier builds kept the sign-in password for 30 days in a cookie, encrypted under a key stored beside it. */
export function clearLegacyRememberedPassword(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${LEGACY_PASSWORD_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict`;
  try {
    localStorage.removeItem(LEGACY_PASSWORD_KEY_STORAGE_KEY);
    sessionStorage.removeItem(LEGACY_FRESH_SIGN_IN_KEY);
  } catch {
    // Blocked storage holds nothing to remove.
  }
}
