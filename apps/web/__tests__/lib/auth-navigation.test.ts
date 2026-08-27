import { describe, expect, it } from "@jest/globals";
import {
  buildPasskeyStepUpLoginHref,
  isPasskeyStepUpExemptPath,
} from "@/lib/auth-navigation";

describe("passkey step-up login navigation", () => {
  it("keeps login, passkey bridge, and reset-password routes on the auth screens", () => {
    expect(isPasskeyStepUpExemptPath("/login")).toBe(true);
    expect(isPasskeyStepUpExemptPath("/passkey/native")).toBe(true);
    expect(isPasskeyStepUpExemptPath("/reset-password")).toBe(true);
    expect(isPasskeyStepUpExemptPath("/calendar")).toBe(false);
    expect(isPasskeyStepUpExemptPath(null)).toBe(false);
    expect(isPasskeyStepUpExemptPath(undefined)).toBe(false);
  });

  it("sends protected routes to login with a step-up hint", () => {
    expect(buildPasskeyStepUpLoginHref("/calendar?eventId=evt-1")).toBe(
      "/login?next=%2Fcalendar%3FeventId%3Devt-1&stepUp=1",
    );
  });
});
