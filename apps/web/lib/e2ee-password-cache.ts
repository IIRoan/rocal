const PENDING_AUTH_PASSWORD_KEY = "solace:e2ee:pending-auth-password";
const CACHED_AUTH_PASSWORD_KEY = "solace:e2ee:cached-auth-password";

function removeAuthPasswordKey(key: string): void {
  sessionStorage.removeItem(key);
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

  sessionStorage.setItem(PENDING_AUTH_PASSWORD_KEY, password);
  sessionStorage.setItem(CACHED_AUTH_PASSWORD_KEY, password);
}

export function consumePendingAuthPassword(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const password = sessionStorage.getItem(PENDING_AUTH_PASSWORD_KEY);
  sessionStorage.removeItem(PENDING_AUTH_PASSWORD_KEY);
  return password;
}

export function peekPendingAuthPassword(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return sessionStorage.getItem(PENDING_AUTH_PASSWORD_KEY);
}

export function peekCachedAuthPassword(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return sessionStorage.getItem(CACHED_AUTH_PASSWORD_KEY);
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