import { describe, expect, it } from "@jest/globals";
import {
  eventReminderPayload,
  newMailPayload,
  NotificationJobPayloadError,
  sanitizeNotificationDisplayTitle,
  sanitizeNotificationJobPayload,
  shouldScheduleEventReminder,
} from "../../lib/notification-job";

describe("notification-job payload", () => {
  it("accepts the closed allowlist", () => {
    expect(
      sanitizeNotificationJobPayload({
        kind: "event_reminder",
        eventId: "evt-1",
        minutesBefore: 15,
        title: "Lunch with Sam",
      }),
    ).toEqual({
      kind: "event_reminder",
      eventId: "evt-1",
      minutesBefore: 15,
      title: "Lunch with Sam",
    });
  });

  it("rejects content fields", () => {
    expect(() =>
      sanitizeNotificationJobPayload({
        kind: "new_mail",
        inboundCount: 1,
        title: "Secret",
      }),
    ).toThrow(NotificationJobPayloadError);

    expect(() =>
      sanitizeNotificationJobPayload({
        kind: "event_reminder",
        eventId: "evt-1",
        minutesBefore: 15,
        subject: "Lunch",
      }),
    ).toThrow(NotificationJobPayloadError);
  });

  it("accepts a new-mail subject", () => {
    expect(
      sanitizeNotificationJobPayload({
        kind: "new_mail",
        inboundCount: 1,
        subject: "  Lunch plans  ",
      }),
    ).toEqual({
      kind: "new_mail",
      inboundCount: 1,
      subject: "Lunch plans",
    });
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
    expect(newMailPayload(1, { subject: "Invoice attached" })).toEqual({
      kind: "new_mail",
      inboundCount: 1,
      subject: "Invoice attached",
    });
    expect(
      newMailPayload(1, {
        subject: "Invoice attached",
        fromName: "  Sam  ",
        emailId: "email-1",
      }),
    ).toEqual({
      kind: "new_mail",
      inboundCount: 1,
      subject: "Invoice attached",
      fromName: "Sam",
      emailId: "email-1",
    });
    expect(newMailPayload(2, { subject: "Invoice attached" })).toEqual({
      kind: "new_mail",
      inboundCount: 2,
    });
    expect(
      eventReminderPayload({
        eventId: "evt-1",
        minutesBefore: 0,
        title: " Lunch with Sam ",
      }),
    ).toEqual({
      kind: "event_reminder",
      eventId: "evt-1",
      minutesBefore: 0,
      title: "Lunch with Sam",
    });
  });

  it("sanitizes reminder display titles", () => {
    expect(sanitizeNotificationDisplayTitle("  Lunch   plans  ")).toBe(
      "Lunch plans",
    );
    expect(sanitizeNotificationDisplayTitle("   ")).toBeNull();
    expect(sanitizeNotificationDisplayTitle("Encrypted event")).toBeNull();
    expect(sanitizeNotificationDisplayTitle(1)).toBeNull();
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
