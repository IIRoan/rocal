import { isApiError } from "./types";

export const PASSKEY_STEP_UP_REQUIRED_CODE = "PASSKEY_STEP_UP_REQUIRED";
export const PASSKEY_STEP_UP_REQUIRED_MESSAGE =
  "Passkey verification required.";

function readErrorCode(details: unknown): string | null {
  if (
    typeof details !== "object" ||
    details === null ||
    !("code" in details) ||
    typeof details.code !== "string"
  ) {
    return null;
  }

  return details.code;
}

export function isPasskeyStepUpRequiredError(error: unknown): boolean {
  if (!isApiError(error) || error.statusCode !== 403) {
    return false;
  }

  return (
    error.message === PASSKEY_STEP_UP_REQUIRED_MESSAGE ||
    readErrorCode(error.details) === PASSKEY_STEP_UP_REQUIRED_CODE
  );
}
