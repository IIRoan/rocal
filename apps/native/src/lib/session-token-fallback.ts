/**
 * Last-known session token from a successful sign-in / getSession.
 * Cookie-jar races (Better Auth applying Max-Age=0 Set-Cookie after we persist)
 * can empty SecureStore while React still has a valid session. Headers fall
 * back to this token so the first post-login API calls are not 401s.
 */
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
