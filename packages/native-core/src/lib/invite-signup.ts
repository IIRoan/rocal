import type {
  ClaimInviteResponse,
  ValidateInviteTokenResponse,
} from "@workspace/calendar-client";

export interface InviteTokenService {
  validateInviteToken: (token: string) => Promise<ValidateInviteTokenResponse>;
  claimInviteToken: (
    token: string,
    chosenEmail: string,
  ) => Promise<ClaimInviteResponse>;
}

export type InviteValidationState =
  | { status: "empty" }
  | { status: "checking" }
  | { status: "valid"; inviterName: string }
  | { status: "invalid"; reason: string };

export type InviteClaimResult = { ok: true } | { ok: false; error: string };

export const INVITE_REQUIRED_MESSAGE =
  "An invite token is required to create an account.";
export const INVITE_HINT_MESSAGE =
  "Solace is invite-only. Enter the token shared with you.";

/** Reads the `invite` deep-link param (e.g. solace://sign-up?invite=<token>). */
export function readInviteTokenParam(
  value: string | string[] | undefined,
): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ?? "";
}

export async function validateInviteTokenSafely(
  service: InviteTokenService,
  token: string,
): Promise<ValidateInviteTokenResponse> {
  try {
    return await service.validateInviteToken(token);
  } catch {
    return { valid: false, reason: "Could not validate token" };
  }
}

export function toInviteValidationState(
  result: ValidateInviteTokenResponse,
): InviteValidationState {
  if (result.valid) {
    return { status: "valid", inviterName: result.inviterName };
  }
  return { status: "invalid", reason: result.reason || "Invalid token" };
}

export function describeInviteValidation(
  state: InviteValidationState,
): string {
  switch (state.status) {
    case "empty":
      return INVITE_HINT_MESSAGE;
    case "checking":
      return "Checking invite…";
    case "valid":
      return state.inviterName
        ? `Valid — invited by ${state.inviterName}`
        : "Valid invite token.";
    case "invalid":
      return state.reason;
  }
}

/** Claims the invite for the chosen address; the backend only allows sign-up for a claimed email. */
export async function claimSignupInvite(
  service: InviteTokenService,
  token: string,
  normalizedEmail: string,
): Promise<InviteClaimResult> {
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    return { ok: false, error: INVITE_REQUIRED_MESSAGE };
  }

  const result = await service.claimInviteToken(trimmedToken, normalizedEmail);
  if (!result.success) {
    return { ok: false, error: result.reason };
  }
  return { ok: true };
}
