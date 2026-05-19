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
  beforeEach(() => {
    clearPasskeyPresenceCache();
  });

  it("writes a verified step-up cookie to response headers", () => {
    const headers = new Headers();

    setVerifiedPasskeyStepUpCookie({ headers });

    const cookieHeader = headers.get("set-cookie");

    expect(cookieHeader).toContain(`${PASSKEY_STEP_UP_COOKIE_NAME}=verified`);
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

  it("detects a verified step-up cookie on requests", () => {
    const request = new Request("http://localhost", {
      headers: {
        cookie: `${PASSKEY_STEP_UP_COOKIE_NAME}=verified; other=value`,
      },
    });

    expect(hasVerifiedPasskeyStepUp(request)).toBe(true);
  });

  it("caches positive passkey lookups instead of recounting on every request", async () => {
    const prisma = {
      passkey: {
        findFirst: jest.fn(async () => ({ id: "passkey-1" })),
      },
    };
    const request = new Request("http://localhost");

    await expect(
      getPasskeyStepUpStatus({
        prisma: prisma as never,
        request,
        userId: "user-1",
      }),
    ).resolves.toMatchObject({
      hasPasskeys: true,
      requiresPasskeyStepUp: true,
    });

    await expect(
      getPasskeyStepUpStatus({
        prisma: prisma as never,
        request,
        userId: "user-1",
      }),
    ).resolves.toMatchObject({
      hasPasskeys: true,
      requiresPasskeyStepUp: true,
    });

    expect(prisma.passkey.findFirst).toHaveBeenCalledTimes(1);
  });
});
