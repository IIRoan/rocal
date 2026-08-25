import { describe, expect, it } from "@jest/globals";
import { readLoginSearchParams } from "../../app/login/login-form-params";

describe("readLoginSearchParams", () => {
  it("detects a passkey step-up return to the login page", () => {
    expect(
      readLoginSearchParams(new URLSearchParams("next=/calendar&stepUp=1")),
    ).toEqual({
      nextPath: "/calendar",
      callbackUrl: null,
      resetSucceeded: false,
      inviteToken: null,
      stepUpRequired: true,
    });
  });
});
