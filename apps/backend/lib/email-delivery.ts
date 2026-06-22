import {
  OPERATION_WARNING_CODES,
  emailDeliveryFailedMessage,
  reminderScheduleFailedMessage,
  type OperationWarning,
  type ReminderScheduleWarningContext,
} from "@workspace/calendar-core";

export type EmailDeliveryChannel = "resend" | "mailbox";

export type EmailDeliveryResult = {
  delivered: boolean;
  channel?: EmailDeliveryChannel;
  /** User-safe explanation when delivery did not succeed. */
  reason?: string;
};

export function emailDeliveryWarning(
  label: string,
  target: string,
): OperationWarning {
  return {
    code: OPERATION_WARNING_CODES.EMAIL_DELIVERY_FAILED,
    message: emailDeliveryFailedMessage(label, target),
    target,
  };
}

export function reminderScheduleWarning(
  context: ReminderScheduleWarningContext,
): OperationWarning {
  return {
    code: OPERATION_WARNING_CODES.REMINDER_SCHEDULE_FAILED,
    message: reminderScheduleFailedMessage(context),
  };
}
