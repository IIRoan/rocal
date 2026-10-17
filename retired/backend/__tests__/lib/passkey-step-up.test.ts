import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import {
  PASSKEY_STEP_UP_COOKIE_NAME,
  clearPasskeyPresenceCache,
  clearPasskeyStepUpCookie,
  getPasskeyStepUpStatus,
  hasVerifiedPasskeyStepUp,
  renewVerifiedPasskeyStepUpCookie,
  setVerifiedPasskeyStepUpCookie,
} from "../../lib/passkey-step-up";

describe("passkey step-up cookies", () => {
  const binding = { userId: "user-1", sessionId: "session-1" };
  const lifetimeSeconds = 14 * 24 * 60 * 60;

  function verifiedRequest(headers: Headers) {
    return new Request("http://localhost", {
      headers: { cookie: headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ") },
    });
  }

  beforeEach(() => {
    clearPasskeyPresenceCache();
    process.env.BETTER_AUTH_SECRET = "test-secret-for-passkey-step-up-cookies";
  });

  it("writes a signed step-up cookie to response headers", () => {
    const headers = new Headers();

    setVerifiedPasskeyStepUpCookie({ headers }, binding);

    const cookieHeader = headers.get("set-cookie");

    expect(cookieHeader).toContain(`${PASSKEY_STEP_UP_COOKIE_NAME}=`);
    expect(cookieHeader).not.toContain("=verified");
    expect(cookieHeader).toContain("Path=/");
    expect(cookieHeader).toContain("HttpOnly");
  });

  it("writes a clearing step-up cookie to response headers", () => {
    const headers = new Headers();

    clearPasskeyStepUpCookie({ headers });

    const cookieHeader = headers.get("set-cookie");

    expect(cookieHeader).toContain(`${PASSKEY_STEP_UP_COOKIE_NAME}=`);
    expect(cookieHeader).toContain("Max-Age=0");
  });

  it("keeps verification for two weeks and rejects it exactly at expiry", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-08T12:00:00Z"));
    const headers = new Headers();
    setVerifiedPasskeyStepUpCookie({ headers }, binding);
    expect(headers.get("set-cookie")).toContain(`Max-Age=${lifetimeSeconds}`);
    const request = verifiedRequest(headers);
    jest.advanceTimersByTime((lifetimeSeconds - 1) * 1000);
    expect(hasVerifiedPasskeyStepUp(request, binding)).toBe(true);
    jest.advanceTimersByTime(1000);
    expect(hasVerifiedPasskeyStepUp(request, binding)).toBe(false);
  });

  it("renews valid verification daily without writing on every request", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-08T12:00:00Z"));
    const initial = new Headers();
    setVerifiedPasskeyStepUpCookie({ headers: initial }, binding);
    const request = verifiedRequest(initial);
    const renewed = new Headers();
    renewVerifiedPasskeyStepUpCookie(request, { headers: renewed }, binding);
    expect(renewed.has("set-cookie")).toBe(false);
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    renewVerifiedPasskeyStepUpCookie(request, { headers: renewed }, binding);
    expect(renewed.has("set-cookie")).toBe(true);
    jest.advanceTimersByTime(13 * 24 * 60 * 60 * 1000);
    expect(hasVerifiedPasskeyStepUp(verifiedRequest(renewed), binding)).toBe(true);
    const headers = new Headers();
    renewVerifiedPasskeyStepUpCookie(request, { headers }, binding);
    renewVerifiedPasskeyStepUpCookie(verifiedRequest(renewed), { headers }, { ...binding, sessionId: "other-session" });
    expect(headers.has("set-cookie")).toBe(false);
  });

  it("detects a verified step-up cookie bound to the session", () => {
    const headers = new Headers();
    setVerifiedPasskeyStepUpCookie({ headers }, binding);
    const cookieHeader = headers.get("set-cookie") ?? "";
    const value = decodeURIComponent(
      cookieHeader.split(`${PASSKEY_STEP_UP_COOKIE_NAME}=`)[1]?.split(";")[0] ??
        "",
    );

    const request = new Request("http://localhost", {
      headers: {
        cookie: `${PASSKEY_STEP_UP_COOKIE_NAME}=${value}`,
      },
    });

    expect(hasVerifiedPasskeyStepUp(request, binding)).toBe(true);
    expect(
      hasVerifiedPasskeyStepUp(request, {
        userId: "other-user",
        sessionId: "session-1",
      }),
    ).toBe(false);
  });

  it("caches positive passkey lookups instead of recounting on every request", async () => {
    const prisma = {
      passkey: {
        findFirst: jest.fn(async () => ({ id: "passkey-1" })),
      },
    };
    const headers = new Headers();
    setVerifiedPasskeyStepUpCookie({ headers }, binding);
    const cookieHeader = headers.get("set-cookie") ?? "";
    const value = decodeURIComponent(
      cookieHeader.split(`${PASSKEY_STEP_UP_COOKIE_NAME}=`)[1]?.split(";")[0] ??
        "",
    );
    const request = new Request("http://localhost", {
      headers: {
        cookie: `${PASSKEY_STEP_UP_COOKIE_NAME}=${value}`,
      },
    });

    await expect(
      getPasskeyStepUpStatus({
        prisma: prisma as never,
        request,
        userId: binding.userId,
        sessionId: binding.sessionId,
      }),
    ).resolves.toMatchObject({
      hasPasskeys: true,
      requiresPasskeyStepUp: false,
    });

    await expect(
      getPasskeyStepUpStatus({
        prisma: prisma as never,
        request,
        userId: binding.userId,
        sessionId: binding.sessionId,
      }),
    ).resolves.toMatchObject({
      hasPasskeys: true,
      requiresPasskeyStepUp: false,
    });

    expect(prisma.passkey.findFirst).toHaveBeenCalledTimes(1);
  });
});
