import { getErrorMessage as getErrorMessageCore } from "@workspace/calendar-core";

export function getAccountSettingsErrorMessage(error: unknown): string {
  return getErrorMessageCore(error, "Something went wrong.");
}
