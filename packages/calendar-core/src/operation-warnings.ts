/**
 * Non-fatal issues from a mutation that succeeded partially.
 * Clients should surface these to the user so nothing fails silently.
 */
export type OperationWarning = {
  code: string;
  message: string;
  /** Optional target, e.g. an email address or resource id. */
  target?: string;
};

export const OPERATION_WARNING_CODES = {
  EMAIL_DELIVERY_FAILED: "email_delivery_failed",
  REMINDER_SCHEDULE_FAILED: "reminder_schedule_failed",
} as const;

export type ReminderScheduleWarningContext = "create" | "update";

/** API payloads that succeeded but may include non-fatal warnings. */
export type WithOperationWarnings<T> = T & {
  warnings?: OperationWarning[];
};

export function emailDeliveryFailedMessage(
  label: string,
  target: string,
): string {
  return `Could not deliver the ${label} email to ${target}. Try again later or contact support.`;
}

export function reminderScheduleFailedMessage(
  context: ReminderScheduleWarningContext,
): string {
  return context === "create"
    ? "Your event was saved, but the email reminder could not be scheduled. Try again from event settings."
    : "Your event was saved, but reminder settings could not be updated. Try again from event settings.";
}

export function getOperationWarnings(
  payload: unknown,
): OperationWarning[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const warnings = (payload as WithOperationWarnings<unknown>).warnings;
  if (!Array.isArray(warnings) || warnings.length === 0) {
    return [];
  }

  return warnings.filter(
    (warning): warning is OperationWarning =>
      !!warning &&
      typeof warning === "object" &&
      typeof warning.message === "string" &&
      warning.message.length > 0,
  );
}

export function getOperationWarningMessages(payload: unknown): string[] {
  return getOperationWarnings(payload).map((warning) => warning.message);
}

export type InviteCreateFeedback = {
  tone: "success" | "warning";
  text: string;
};

/** User-facing copy after a create-invite mutation succeeds. */
export function getInviteCreateFeedback(
  email: string,
  payload: WithOperationWarnings<unknown>,
): InviteCreateFeedback {
  const warningMessages = getOperationWarningMessages(payload);
  if (warningMessages.length === 0) {
    return {
      tone: "success",
      text: `Invite email sent to ${email}.`,
    };
  }

  return {
    tone: "warning",
    text: `Invite created for ${email}. ${warningMessages.join(" ")}`,
  };
}
