const PENDING_AUTH_PASSWORD_KEY = "solace:e2ee:pending-auth-password";

export function storePendingAuthPassword(password: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const trimmed = password.trim();

  if (!trimmed) {
    sessionStorage.removeItem(PENDING_AUTH_PASSWORD_KEY);
    return;
  }

  sessionStorage.setItem(PENDING_AUTH_PASSWORD_KEY, password);
}

export function consumePendingAuthPassword(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const password = sessionStorage.getItem(PENDING_AUTH_PASSWORD_KEY);
  sessionStorage.removeItem(PENDING_AUTH_PASSWORD_KEY);
  return password;
}

export function clearPendingAuthPassword(): void {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.removeItem(PENDING_AUTH_PASSWORD_KEY);
}