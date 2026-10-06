/** Last-known token: cookie-jar races can empty SecureStore mid-session, so early headers fall back to it instead of 401ing. */
let fallbackSessionToken: string | null = null;

export function setFallbackSessionToken(token: string | null | undefined) {
  const trimmed = token?.trim();
  fallbackSessionToken = trimmed ? trimmed : null;
}

export function getFallbackSessionToken() {
  return fallbackSessionToken;
}

export function fallbackSessionCookieHeader(preferSecure: boolean) {
  if (!fallbackSessionToken) {
    return "";
  }
  const name = preferSecure
    ? "__Secure-better-auth.session_token"
    : "better-auth.session_token";
  return `${name}=${fallbackSessionToken}`;
}
