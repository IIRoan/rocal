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
  const parsed = parseCachedAuthSession(cached);
  expect(parsed?.user.id).toBe("offline-user");
  expect(parsed?.session.expiresAt).toEqual(new Date(cached.session.expiresAt));
});

it("accepts the already-decoded in-memory session", () => {
  const parsed = parseCachedAuthSession(cachedSession());
  expect(parseCachedAuthSession(parsed)).toEqual(parsed);
});

it("ignores additive response metadata without copying it into auth state", () => {
  const cached = cachedSession();
  const extended = {
    ...cached,
    futureField: "private-extra-sentinel",
    user: { ...cached.user, futureUserField: "private-user-sentinel" },
    session: { ...cached.session, futureSessionField: "private-session-sentinel" },
  };
  const parsed = parseCachedAuthSession(extended);
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
    expect(parseCachedAuthSession(cached)).toBeNull();
  },
);
