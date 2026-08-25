import { describe, expect, it } from "@jest/globals";
import {
  PASSKEY_STEP_UP_REQUIRED_CODE,
  PASSKEY_STEP_UP_REQUIRED_MESSAGE,
  isPasskeyStepUpRequiredError,
} from "../passkey-step-up";

describe("isPasskeyStepUpRequiredError", () => {
  it("matches the backend passkey step-up 403 message", () => {
    expect(
      isPasskeyStepUpRequiredError({
        error: "Forbidden",
        message: PASSKEY_STEP_UP_REQUIRED_MESSAGE,
        statusCode: 403,
      }),
    ).toBe(true);
  });

  it("matches a structured passkey step-up error code", () => {
    expect(
      isPasskeyStepUpRequiredError({
        error: "Forbidden",
        message: "Access forbidden",
        statusCode: 403,
        details: { code: PASSKEY_STEP_UP_REQUIRED_CODE },
      }),
    ).toBe(true);
  });

  it("ignores other forbidden API errors", () => {
    expect(
      isPasskeyStepUpRequiredError({
        error: "Forbidden",
        message: "Not an attendee",
        statusCode: 403,
      }),
    ).toBe(false);
  });
});
