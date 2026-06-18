import { describe, expect, it } from "@jest/globals";
import {
  OPERATION_WARNING_CODES,
  emailDeliveryFailedMessage,
  reminderScheduleFailedMessage,
} from "@workspace/calendar-core";
import {
  emailDeliveryWarning,
  reminderScheduleWarning,
} from "../../lib/email-delivery";

describe("email-delivery", () => {
  it("builds user-safe email delivery warnings", () => {
    expect(emailDeliveryWarning("invite", "guest@example.com")).toEqual({
      code: OPERATION_WARNING_CODES.EMAIL_DELIVERY_FAILED,
      message: emailDeliveryFailedMessage("invite", "guest@example.com"),
      target: "guest@example.com",
    });
  });

  it("builds user-safe reminder schedule warnings", () => {
    expect(reminderScheduleWarning("create")).toEqual({
      code: OPERATION_WARNING_CODES.REMINDER_SCHEDULE_FAILED,
      message: reminderScheduleFailedMessage("create"),
    });

    expect(reminderScheduleWarning("update")).toEqual({
      code: OPERATION_WARNING_CODES.REMINDER_SCHEDULE_FAILED,
      message: reminderScheduleFailedMessage("update"),
    });
  });
});
