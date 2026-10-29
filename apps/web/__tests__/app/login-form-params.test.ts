import { describe, expect, it } from "@jest/globals";
import { readLoginSearchParams } from "../../app/login/login-form-params";
import { createInitialLoginFormChrome } from "../../app/login/login-form-state";
import {
  SIGN_IN_TO_UNLOCK_NOTICE,
  UNLOCK_FAILED_NOTICE,
} from "@workspace/calendar-core/product-info";

describe("readLoginSearchParams", () => {
  it("detects a passkey step-up return to the login page", () => {
    expect(
      readLoginSearchParams(new URLSearchParams("next=/calendar&stepUp=1")),
    ).toEqual({
      nextPath: "/calendar",
      callbackUrl: null,
      inviteToken: null,
      stepUpRequired: true,
      e2eeLock: null,
    });
  });

  it("reads only the known encryption lock reasons", () => {
    const lockOf = (query: string) =>
      readLoginSearchParams(new URLSearchParams(query)).e2eeLock;
    expect(lockOf("e2ee=sign-in")).toBe("sign-in");
    expect(lockOf("e2ee=failed")).toBe("failed");
    expect(lockOf("e2ee=other")).toBeNull();
  });
});

describe("createInitialLoginFormChrome", () => {
  it("explains why an encryption lock ended the session", () => {
    expect(createInitialLoginFormChrome("sign-in")).toMatchObject({
      notice: SIGN_IN_TO_UNLOCK_NOTICE,
      error: null,
    });
    expect(createInitialLoginFormChrome("failed")).toMatchObject({
      notice: null,
      error: UNLOCK_FAILED_NOTICE,
    });
    expect(createInitialLoginFormChrome(null)).toMatchObject({
      notice: null,
      error: null,
    });
  });
});
