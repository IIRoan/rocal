import {
  INVITE_HINT_MESSAGE,
  INVITE_REQUIRED_MESSAGE,
  claimSignupInvite,
  describeInviteValidation,
  readInviteTokenParam,
  toInviteValidationState,
  validateInviteTokenSafely,
  type InviteTokenService,
} from "./invite-signup";

function createService(
  overrides: Partial<InviteTokenService> = {},
): jest.Mocked<InviteTokenService> {
  return {
    validateInviteToken: jest.fn(async () => ({
      valid: true as const,
      inviteId: "inv-1",
      email: "friend@example.com",
      inviterName: "Ada",
    })),
    claimInviteToken: jest.fn(async () => ({
      success: true as const,
      inviteId: "inv-1",
    })),
    ...overrides,
  } as jest.Mocked<InviteTokenService>;
}

describe("readInviteTokenParam", () => {
  it("reads and trims a single deep-link value", () => {
    expect(readInviteTokenParam("  tok-123 ")).toBe("tok-123");
  });

  it("takes the first value when the param repeats", () => {
    expect(readInviteTokenParam(["tok-1", "tok-2"])).toBe("tok-1");
  });

  it("returns an empty token when the param is missing", () => {
    expect(readInviteTokenParam(undefined)).toBe("");
  });
});

describe("validateInviteTokenSafely", () => {
  it("returns the backend validation result", async () => {
    const service = createService();
    await expect(validateInviteTokenSafely(service, "tok")).resolves.toEqual(
      expect.objectContaining({ valid: true, inviterName: "Ada" }),
    );
    expect(service.validateInviteToken).toHaveBeenCalledWith("tok");
  });

  it("maps request failures to an invalid result like web", async () => {
    const service = createService({
      validateInviteToken: jest.fn(async () => {
        throw new Error("network");
      }),
    });
    await expect(validateInviteTokenSafely(service, "tok")).resolves.toEqual({
      valid: false,
      reason: "Could not validate token",
    });
  });
});

describe("toInviteValidationState / describeInviteValidation", () => {
  it("describes a valid invite with the inviter name", () => {
    const state = toInviteValidationState({
      valid: true,
      inviteId: "inv-1",
      email: "friend@example.com",
      inviterName: "Ada",
    });
    expect(state).toEqual({ status: "valid", inviterName: "Ada" });
    expect(describeInviteValidation(state)).toBe("Valid — invited by Ada");
  });

  it("falls back to a generic valid message without an inviter name", () => {
    expect(
      describeInviteValidation({ status: "valid", inviterName: "" }),
    ).toBe("Valid invite token.");
  });

  it("surfaces the backend reason for invalid invites", () => {
    const state = toInviteValidationState({
      valid: false,
      reason: "This invite has already been claimed.",
    });
    expect(describeInviteValidation(state)).toBe(
      "This invite has already been claimed.",
    );
  });

  it("shows the invite-only hint when the field is empty", () => {
    expect(describeInviteValidation({ status: "empty" })).toBe(
      INVITE_HINT_MESSAGE,
    );
  });
});

describe("claimSignupInvite", () => {
  it("requires a token before calling the backend", async () => {
    const service = createService();
    await expect(
      claimSignupInvite(service, "   ", "me@solace.onl"),
    ).resolves.toEqual({ ok: false, error: INVITE_REQUIRED_MESSAGE });
    expect(service.claimInviteToken).not.toHaveBeenCalled();
  });

  it("claims the trimmed token for the normalized email", async () => {
    const service = createService();
    await expect(
      claimSignupInvite(service, " tok-1 ", "me@solace.onl"),
    ).resolves.toEqual({ ok: true });
    expect(service.claimInviteToken).toHaveBeenCalledWith(
      "tok-1",
      "me@solace.onl",
    );
  });

  it("returns the backend reason when the claim is rejected", async () => {
    const service = createService({
      claimInviteToken: jest.fn(async () => ({
        success: false as const,
        reason: "That email address already has an account.",
      })),
    });
    await expect(
      claimSignupInvite(service, "tok-1", "me@solace.onl"),
    ).resolves.toEqual({
      ok: false,
      error: "That email address already has an account.",
    });
  });
});
