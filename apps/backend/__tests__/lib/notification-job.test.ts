import { describe, expect, it } from "@jest/globals";
import {
  eventReminderPayload,
  newMailPayload,
  NotificationJobPayloadError,
  sanitizeNotificationJobPayload,
  shouldScheduleEventReminder,
} from "../../lib/notification-job";

describe("notification-job payload", () => {
  it("accepts the closed allowlist of opaque refs", () => {
    expect(
      sanitizeNotificationJobPayload({
        kind: "new_mail",
        inboundCount: 1,
        emailId: " email-1 ",
        accountId: "acct-1",
      }),
    ).toEqual({
      kind: "new_mail",
      inboundCount: 1,
      emailId: "email-1",
      accountId: "acct-1",
    });
  });

  it.each(["title", "subject", "fromName", "displayTitle"])(
    "rejects the plaintext content field %s",
    (field) => {
      expect(() =>
        sanitizeNotificationJobPayload({
          kind: "new_mail",
          inboundCount: 1,
          [field]: "Secret",
        }),
      ).toThrow(NotificationJobPayloadError);
      expect(() =>
        sanitizeNotificationJobPayload({
          kind: "event_reminder",
          eventId: "evt-1",
          minutesBefore: 15,
          [field]: "Secret",
        }),
      ).toThrow(NotificationJobPayloadError);
    },
  );

  it("rejects refs that belong to the other job kind", () => {
    expect(() =>
      sanitizeNotificationJobPayload({
        kind: "event_reminder",
        eventId: "evt-1",
        emailId: "email-1",
      }),
    ).toThrow(NotificationJobPayloadError);
    expect(() =>
      sanitizeNotificationJobPayload({
        kind: "new_mail",
        inboundCount: 1,
        eventId: "evt-1",
      }),
    ).toThrow(NotificationJobPayloadError);
  });

  it("builds event and mail payloads", () => {
    expect(eventReminderPayload({ eventId: "evt-1", minutesBefore: 0 })).toEqual(
      {
        kind: "event_reminder",
        eventId: "evt-1",
        minutesBefore: 0,
      },
    );
    expect(newMailPayload(3)).toEqual({
      kind: "new_mail",
      inboundCount: 3,
    });
    expect(
      newMailPayload(1, { emailId: "email-1", accountId: " acct-1 " }),
    ).toEqual({
      kind: "new_mail",
      inboundCount: 1,
      emailId: "email-1",
      accountId: "acct-1",
    });
  });
});

describe("shouldScheduleEventReminder", () => {
  it("schedules when either channel is on", () => {
    expect(shouldScheduleEventReminder(null)).toBe(true);
    expect(
      shouldScheduleEventReminder({
        emailNotifications: false,
        pushNotifications: true,
      }),
    ).toBe(true);
    expect(
      shouldScheduleEventReminder({
        emailNotifications: true,
        pushNotifications: false,
      }),
    ).toBe(true);
    expect(
      shouldScheduleEventReminder({
        emailNotifications: false,
        pushNotifications: false,
      }),
    ).toBe(false);
  });
});
