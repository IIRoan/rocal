import { parseCachedAuthSession } from "./cached-auth-session";

function cachedSession() {
  return {
    user: {
      id: "offline-user",
      name: "Journey",
      email: "journey@solace.test",
      emailVerified: true,
      image: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    session: {
      id: "offline-session",
      userId: "offline-user",
      token: "offline-token",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ipAddress: null,
      userAgent: null,
    },
  };
}

it("opens Better Auth's stored dates as dates without extending the session", () => {
  const cached = cachedSession();
  const parsed = parseCachedAuthSession(cached, "better-auth.session_token=offline-token.signature");
  expect(parsed?.user.id).toBe("offline-user");
  expect(parsed?.session.expiresAt).toEqual(new Date(cached.session.expiresAt));
});

it("accepts the already-decoded in-memory session", () => {
  const parsed = parseCachedAuthSession(cachedSession(), "better-auth.session_token=offline-token.signature");
  expect(parseCachedAuthSession(parsed, "better-auth.session_token=offline-token.signature")).toEqual(parsed);
});

it("ignores additive response metadata without copying it into auth state", () => {
  const cached = cachedSession();
  const extended = {
    ...cached,
    futureField: "private-extra-sentinel",
    user: { ...cached.user, futureUserField: "private-user-sentinel" },
    session: { ...cached.session, futureSessionField: "private-session-sentinel" },
  };
  const parsed = parseCachedAuthSession(extended, "better-auth.session_token=offline-token.signature");
  expect(parsed?.user.id).toBe(cached.user.id);
  expect(JSON.stringify(parsed)).not.toContain("private-");
});

it.each(["expired", "invalid expiry", "different owner", "missing token", "blank token", "missing owner", "invalid user"])(
  "refuses a cached session with %s",
  (fault) => {
    const cached = cachedSession();
    switch (fault) {
      case "expired": cached.session.expiresAt = new Date(Date.now() - 1).toISOString(); break;
      case "invalid expiry": cached.session.expiresAt = "invalid"; break;
      case "different owner": cached.session.userId = "another-user"; break;
      case "missing token": cached.session.token = ""; break;
      case "blank token": cached.session.token = "  "; break;
      case "missing owner": cached.session.userId = ""; break;
      case "invalid user": cached.user.email = "invalid"; break;
    }
    expect(parseCachedAuthSession(cached, "better-auth.session_token=offline-token.signature")).toBeNull();
  },
);

it.each([
  "better-auth.session_token=offline-token",
  "__Secure-better-auth.session_token=offline-token.signature%2B%2F%3D",
  "solace-passkey-step-up=step-up; better-auth.session_token=offline-token.signature",
  "better-auth.session_token=offline-token.signature; __Secure-better-auth.session_token=offline-token.signature",
])("restores a cache with its matching signed or fallback cookie (%s)", (cookie) => {
  expect(parseCachedAuthSession(cachedSession(), cookie)?.user.id).toBe("offline-user");
});

it.each([
  "",
  "solace-passkey-step-up=step-up",
  "better-auth.session_data=offline-token",
  "better-auth.session_token_hint=offline-token.signature",
  "__Secure-better-auth.session_token=other-token.signature",
  "better-auth.session_token=offline-token-extra.signature",
  "better-auth.session_token=offline-token.",
  "better-auth.session_token=%ZZ",
  "better-auth.session_token=offline-token.signature; __Secure-better-auth.session_token=other-token.signature",
])("refuses missing, malformed or conflicting session cookies (%s)", (cookie) => {
  expect(parseCachedAuthSession(cachedSession(), cookie)).toBeNull();
});

it("compares the complete token when the stored token contains a dot", () => {
  const cached = cachedSession();
  cached.session.token = "offline.token";
  expect(parseCachedAuthSession(cached, "better-auth.session_token=offline.token.signature")?.user.id).toBe(cached.user.id);
  expect(parseCachedAuthSession(cached, "better-auth.session_token=offline.token-extra.signature")).toBeNull();
});
