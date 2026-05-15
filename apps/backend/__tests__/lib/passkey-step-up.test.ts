import { describe, expect, it } from "@jest/globals";

import {
  PASSKEY_STEP_UP_COOKIE_NAME,
  clearPasskeyStepUpCookie,
  hasVerifiedPasskeyStepUp,
  setVerifiedPasskeyStepUpCookie,
} from "../../lib/passkey-step-up";

describe("passkey step-up cookies", () => {
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
});
