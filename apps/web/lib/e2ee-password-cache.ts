const PENDING_AUTH_PASSWORD_KEY = "solace:e2ee:pending-auth-password";
const CACHED_AUTH_PASSWORD_KEY = "solace:e2ee:cached-auth-password";

/**
 * In-memory only. Persisted unlock still goes through the encrypted cookie +
 * device key in `enc-password-cookie.ts` — never web storage for the plaintext.
 */
const authPasswordMemory = new Map<string, string>();

function removeAuthPasswordKey(key: string): void {
  authPasswordMemory.delete(key);
}

export function storePendingAuthPassword(password: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const trimmed = password.trim();

  if (!trimmed) {
    clearAuthPasswords();
    return;
  }

  authPasswordMemory.set(PENDING_AUTH_PASSWORD_KEY, trimmed);
  authPasswordMemory.set(CACHED_AUTH_PASSWORD_KEY, trimmed);
}

export function peekPendingAuthPassword(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return authPasswordMemory.get(PENDING_AUTH_PASSWORD_KEY) ?? null;
}

export function peekCachedAuthPassword(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return authPasswordMemory.get(CACHED_AUTH_PASSWORD_KEY) ?? null;
}

export function peekAuthPassword(): string | null {
  return peekPendingAuthPassword() ?? peekCachedAuthPassword();
}

export function clearPendingAuthPassword(): void {
  if (typeof window === "undefined") {
    return;
  }

  removeAuthPasswordKey(PENDING_AUTH_PASSWORD_KEY);
}

export function clearCachedAuthPassword(): void {
  if (typeof window === "undefined") {
    return;
  }

  removeAuthPasswordKey(CACHED_AUTH_PASSWORD_KEY);
}

export function clearAuthPasswords(): void {
  if (typeof window === "undefined") {
    return;
  }

  removeAuthPasswordKey(PENDING_AUTH_PASSWORD_KEY);
  removeAuthPasswordKey(CACHED_AUTH_PASSWORD_KEY);
}
