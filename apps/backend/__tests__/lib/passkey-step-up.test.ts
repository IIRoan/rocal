import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import {
  PASSKEY_STEP_UP_COOKIE_NAME,
  clearPasskeyPresenceCache,
  clearPasskeyStepUpCookie,
  getPasskeyStepUpStatus,
  hasVerifiedPasskeyStepUp,
  setVerifiedPasskeyStepUpCookie,
} from "../../lib/passkey-step-up";

describe("passkey step-up cookies", () => {
  const binding = { userId: "user-1", sessionId: "session-1" };

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
