import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { auth } from "../../lib/auth";
import { APIError } from "@better-auth/core/error";
import {
  hasVerifiedPasskeyStepUp,
  setVerifiedPasskeyStepUpCookie,
} from "../../lib/passkey-step-up";

jest.mock("better-auth", () => ({
  betterAuth: (options: unknown) => ({ options }),
}));
jest.mock("@better-auth/expo", () => ({ expo: () => ({}) }));
jest.mock("@better-auth/passkey", () => ({ passkey: () => ({}) }));
jest.mock("better-auth/adapters/prisma", () => ({ prismaAdapter: () => ({}) }));
jest.mock("better-auth/plugins", () => ({
  jwt: () => ({}),
  oneTimeToken: () => ({}),
}));
jest.mock("@better-auth/core/api", () => ({
  createAuthMiddleware: (handler: unknown) => handler,
}));
jest.mock("@better-auth/core/error", () => ({
  APIError: class extends Error {},
}));
jest.mock("../../lib/prisma", () => ({ prisma: { $extends: () => ({}) } }));
jest.mock("../../lib/email-client", () => ({
  mailer: {},
  authEmailFrom: "fixture@test.invalid",
}));
jest.mock("../../lib/invite-service", () => ({ inviteService: {} }));
jest.mock("../../lib/passkey-bridge-session", () => ({
  passkeyBridgeFreshSessionPlugin: {},
}));

type Session = { user: { id: string }; session: { id: string } };
type HookContext = {
  path: string;
  request?: Request;
  headers?: Headers;
  context: {
    returned: unknown;
    responseHeaders: Headers;
    session?: Session;
    newSession?: Session;
  };
};
type Hook = {
  matcher: (context: { path: string }) => boolean;
  handler: (context: HookContext) => Promise<void>;
};
const options = auth.options as {
  session: { expiresIn: number; updateAge: number };
  plugins: { id?: string; hooks?: { after: Hook[] } }[];
};

function verificationHook(path: string) {
  const hook = options.plugins
    .find((plugin) => plugin.id === "passkey-step-up")
    ?.hooks?.after.find((candidate) => candidate.matcher({ path }));
  if (!hook) throw new Error("Verification hook missing");
  return hook;
}

describe("rolling session policy", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("configures two-week app sessions with daily renewal", () => {
    expect(options.session.expiresIn).toBe(14 * 24 * 60 * 60);
    expect(options.session.updateAge).toBe(24 * 60 * 60);
  });

  it("binds successful passkey verification to the newly created session", async () => {
    process.env.BETTER_AUTH_SECRET = "fixture-passkey-policy-secret";
    const headers = new Headers();
    await verificationHook("/passkey/verify-authentication").handler({
      path: "/passkey/verify-authentication",
      request: new Request("http://localhost"),
      context: {
        returned: { ok: true },
        responseHeaders: headers,
        session: { user: { id: "old-user" }, session: { id: "old-session" } },
        newSession: {
          user: { id: "new-user" },
          session: { id: "new-session" },
        },
      },
    });
    const request = new Request("http://localhost", {
      headers: { cookie: headers.get("set-cookie")?.split(";")[0] ?? "" },
    });
    expect(
      hasVerifiedPasskeyStepUp(request, {
        userId: "new-user",
        sessionId: "new-session",
      }),
    ).toBe(true);
    expect(
      hasVerifiedPasskeyStepUp(request, {
        userId: "old-user",
        sessionId: "old-session",
      }),
    ).toBe(false);
  });

  it("never grants verification for a failed passkey response", async () => {
    const headers = new Headers();
    await verificationHook("/passkey/verify-authentication").handler({
      path: "/passkey/verify-authentication",
      request: new Request("http://localhost"),
      context: {
        returned: new APIError("UNAUTHORIZED"),
        responseHeaders: headers,
        session: { user: { id: "user-1" }, session: { id: "session-1" } },
      },
    });
    expect(headers.has("set-cookie")).toBe(false);
  });

  it("extends existing verification during a background session check", async () => {
    process.env.BETTER_AUTH_SECRET = "fixture-passkey-policy-secret";
    jest.useFakeTimers().setSystemTime(new Date("2026-10-08T12:00:00Z"));
    const binding = { userId: "user-1", sessionId: "session-1" };
    const original = new Headers();
    setVerifiedPasskeyStepUpCookie({ headers: original }, binding);
    const request = new Request("http://localhost", {
      headers: { cookie: original.get("set-cookie")?.split(";")[0] ?? "" },
    });
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    const headers = new Headers();
    await verificationHook("/get-session").handler({
      path: "/get-session",
      headers: request.headers,
      context: {
        returned: { user: { id: binding.userId } },
        responseHeaders: headers,
        session: {
          user: { id: binding.userId },
          session: { id: binding.sessionId },
        },
      },
    });
    expect(headers.getSetCookie()).toHaveLength(1);
    expect(headers.get("set-cookie")).toContain("Max-Age=1209600");
  });

  it.each(["missing", "expired", "other-user", "other-session", "tampered"])(
    "cannot turn %s verification into a verified session during renewal",
    async (state) => {
      process.env.BETTER_AUTH_SECRET = "fixture-passkey-policy-secret";
      jest.useFakeTimers().setSystemTime(new Date("2026-10-08T12:00:00Z"));
      const binding = { userId: "user-1", sessionId: "session-1" };
      const original = new Headers();
      setVerifiedPasskeyStepUpCookie({ headers: original }, {
        userId: state === "other-user" ? "other-user" : binding.userId,
        sessionId: state === "other-session" ? "other-session" : binding.sessionId,
      });
      if (state === "expired") jest.advanceTimersByTime(14 * 24 * 60 * 60 * 1000);
      else jest.advanceTimersByTime(24 * 60 * 60 * 1000);
      const cookie = original.get("set-cookie")?.split(";")[0] ?? "";
      const headers = new Headers();
      await verificationHook("/get-session").handler({
        path: "/get-session",
        request: new Request("https://fixture.test", {
          headers: { cookie: state === "missing" ? "" : state === "tampered" ? `${cookie}invalid` : cookie },
        }),
        context: {
          returned: { user: { id: binding.userId } },
          responseHeaders: headers,
          session: { user: { id: binding.userId }, session: { id: binding.sessionId } },
        },
      });
      expect(headers.has("set-cookie")).toBe(false);
    },
  );

  it("keeps verified passkey access beyond the original two weeks with daily use", async () => {
    process.env.BETTER_AUTH_SECRET = "fixture-passkey-policy-secret";
    jest.useFakeTimers().setSystemTime(new Date("2026-10-08T12:00:00Z"));
    const binding = { userId: "user-1", sessionId: "session-1" };
    let cookies = new Headers();
    setVerifiedPasskeyStepUpCookie({ headers: cookies }, binding);
    for (let day = 1; day <= 21; day += 1) {
      jest.advanceTimersByTime(24 * 60 * 60 * 1000);
      const request = new Request("https://fixture.test", {
        headers: { cookie: cookies.get("set-cookie")?.split(";")[0] ?? "" },
      });
      expect(hasVerifiedPasskeyStepUp(request, binding)).toBe(true);
      cookies = new Headers();
      await verificationHook("/get-session").handler({
        path: "/get-session",
        request,
        context: {
          returned: { user: { id: binding.userId } },
          responseHeaders: cookies,
          session: { user: { id: binding.userId }, session: { id: binding.sessionId } },
        },
      });
      expect(cookies.getSetCookie()).toHaveLength(1);
    }
  });
});
