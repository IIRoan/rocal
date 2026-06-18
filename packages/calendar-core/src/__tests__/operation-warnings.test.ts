import { describe, expect, it } from "@jest/globals";
import {
  OPERATION_WARNING_CODES,
  emailDeliveryFailedMessage,
  getInviteCreateFeedback,
  getOperationWarningMessages,
  getOperationWarnings,
} from "../operation-warnings";

describe("operation-warnings", () => {
  it("returns no warnings for payloads without them", () => {
    expect(getOperationWarnings({ id: "event-1" })).toEqual([]);
    expect(getOperationWarningMessages(null)).toEqual([]);
  });

  it("extracts warning messages from mutation payloads", () => {
    const payload = {
      id: "event-1",
      warnings: [
        {
          code: OPERATION_WARNING_CODES.EMAIL_DELIVERY_FAILED,
          message: emailDeliveryFailedMessage("invite", "guest@example.com"),
          target: "guest@example.com",
        },
      ],
    };

    expect(getOperationWarnings(payload)).toHaveLength(1);
    expect(getOperationWarningMessages(payload)).toEqual([
      emailDeliveryFailedMessage("invite", "guest@example.com"),
    ]);
  });

  it("builds invite feedback that reflects delivery failures", () => {
    expect(
      getInviteCreateFeedback("friend@example.com", { id: "invite-1" }),
    ).toEqual({
      tone: "success",
      text: "Invite email sent to friend@example.com.",
    });

    expect(
      getInviteCreateFeedback("friend@example.com", {
        id: "invite-1",
        warnings: [
          {
            code: OPERATION_WARNING_CODES.EMAIL_DELIVERY_FAILED,
            message: emailDeliveryFailedMessage("invite", "friend@example.com"),
            target: "friend@example.com",
          },
        ],
      }),
    ).toEqual({
      tone: "warning",
      text: `Invite created for friend@example.com. ${emailDeliveryFailedMessage("invite", "friend@example.com")}`,
    });
  });
});
