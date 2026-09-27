import type { RecurrenceValidation } from "@workspace/calendar-core";

export const RECURRENCE_VALIDATION_FAILED_MESSAGE =
  "Failed to validate recurrence settings";

/** Server-side check before saving, like web; returns the message to show, or null when the rule may be saved. */
export async function checkEventRecurrence(
  recurrence: string | null | undefined,
  validate: (rule: string) => Promise<RecurrenceValidation>,
): Promise<string | null> {
  if (!recurrence) return null;
  try {
    const validation = await validate(recurrence);
    if (validation.valid) return null;
    return `Invalid recurrence rule: ${validation.errors.join(", ")}`;
  } catch {
    return RECURRENCE_VALIDATION_FAILED_MESSAGE;
  }
}
