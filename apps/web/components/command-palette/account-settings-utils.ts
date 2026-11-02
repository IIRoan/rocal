import { getErrorMessage as getErrorMessageCore } from "@workspace/calendar-core";

export function getAccountSettingsErrorMessage(error: unknown): string {
  return getErrorMessageCore(error, "Unable to save. Check your connection and try again.");
}
