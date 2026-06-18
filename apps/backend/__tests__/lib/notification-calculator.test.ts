import { describe, expect, it, jest } from "@jest/globals";
import { NotificationCalculator } from "../../lib/notification-calculator";

describe("NotificationCalculator", () => {
  it("builds a schedule with a trimmed timezone", () => {
    const schedule = NotificationCalculator.buildNotificationSchedule(
      new Date("2024-01-10T12:00:00.000Z"),
      30,
      "  UTC  ",
    );

    expect(schedule).toEqual({
      notificationTime: new Date("2024-01-10T11:30:00.000Z"),
      notificationDateLocal: "2024-01-10T11:30:00",
      notificationTimezone: "UTC",
    });
  });

  it("falls back to Amsterdam when the timezone is blank", () => {
    const schedule = NotificationCalculator.buildNotificationSchedule(
      new Date("2024-01-10T12:00:00.000Z"),
      15,
      "   ",
    );

    expect(schedule.notificationTimezone).toBe("Europe/Amsterdam");
    expect(schedule.notificationDateLocal).toBe("2024-01-10T12:45:00");
  });

  it("calculates the notification time and rounds to the minute", () => {
    const notificationTime = NotificationCalculator.calculateNotificationTime(
      new Date("2024-01-10T12:00:45.123Z"),
      15,
    );

    expect(notificationTime).toEqual(new Date("2024-01-10T11:45:00.000Z"));
  });

  it("rejects invalid event start values", () => {
    expect(() =>
      NotificationCalculator.calculateNotificationTime(new Date("invalid"), 15),
    ).toThrow("Invalid event start time");
  });

  it("rejects negative or non-integer minutes", () => {
    expect(() =>
      NotificationCalculator.calculateNotificationTime(
        new Date("2024-01-10T12:00:00.000Z"),
        -1,
      ),
    ).toThrow("Minutes before must be a non-negative integer");

    expect(() =>
      NotificationCalculator.calculateNotificationTime(
        new Date("2024-01-10T12:00:00.000Z"),
        1.5,
      ),
    ).toThrow("Minutes before must be a non-negative integer");
  });

  it("marks future notifications as valid", () => {
    const result =
      NotificationCalculator.calculateNotificationTimeWithValidation(
        new Date("2024-01-10T12:00:30.000Z"),
        30,
        new Date("2024-01-10T11:00:15.000Z"),
      );

    expect(result).toEqual({
      notificationTime: new Date("2024-01-10T11:30:00.000Z"),
      isValid: true,
    });
  });

  it("reports past notifications as invalid", () => {
    const result =
      NotificationCalculator.calculateNotificationTimeWithValidation(
        new Date("2024-01-10T12:00:00.000Z"),
        90,
        new Date("2024-01-10T11:00:00.000Z"),
      );

    expect(result).toEqual({
      notificationTime: new Date("2024-01-10T10:30:00.000Z"),
      isValid: false,
      error: "Notification time is in the past",
    });
  });

  it("surfaces calculation errors through the validation wrapper", () => {
    jest.useFakeTimers().setSystemTime(new Date("2024-01-10T09:00:00.000Z"));

    const result =
      NotificationCalculator.calculateNotificationTimeWithValidation(
        new Date("invalid"),
        15,
      );

    expect(result).toEqual({
      notificationTime: new Date("2024-01-10T09:00:00.000Z"),
      isValid: false,
      error: "Invalid event start time",
    });
  });

  it("validates using minute-level rounding", () => {
    const currentTime = new Date("2024-01-10T11:30:45.000Z");

    expect(
      NotificationCalculator.validateNotificationTime(
        new Date("2024-01-10T11:31:10.000Z"),
        currentTime,
      ),
    ).toBe(true);

    expect(
      NotificationCalculator.validateNotificationTime(
        new Date("2024-01-10T11:30:59.000Z"),
        currentTime,
      ),
    ).toBe(false);
  });

  it("returns false when either date is invalid during validation", () => {
    expect(
      NotificationCalculator.validateNotificationTime(
        new Date("invalid"),
        new Date("2024-01-10T11:30:00.000Z"),
      ),
    ).toBe(false);

    expect(
      NotificationCalculator.validateNotificationTime(
        new Date("2024-01-10T11:31:00.000Z"),
        new Date("invalid"),
      ),
    ).toBe(false);
  });

  it("rounds seconds and milliseconds down to zero", () => {
    expect(
      NotificationCalculator.roundToMinute(
        new Date("2024-01-10T11:30:45.321Z"),
      ),
    ).toEqual(new Date("2024-01-10T11:30:00.000Z"));
  });

  it("rejects invalid dates during minute rounding", () => {
    expect(() =>
      NotificationCalculator.roundToMinute(new Date("invalid")),
    ).toThrow("Invalid date provided");
  });

  it("formats local datetime strings in UTC", () => {
    expect(
      NotificationCalculator.formatLocalDateTime(
        new Date("2024-01-10T11:30:45.000Z"),
        "UTC",
      ),
    ).toBe("2024-01-10T11:30:45");
  });

  it("rejects invalid dates when formatting local datetimes", () => {
    expect(() =>
      NotificationCalculator.formatLocalDateTime(new Date("invalid"), "UTC"),
    ).toThrow("Invalid date provided");
  });

  it("calculates multiple notification results while preserving config references", () => {
    const configs = [
      {
        notificationType: "email" as const,
        minutesBefore: 15,
        isEnabled: true,
      },
      {
        notificationType: "browser" as const,
        minutesBefore: 180,
        isEnabled: false,
      },
    ];

    const results = NotificationCalculator.calculateMultipleNotificationTimes(
      new Date("2024-01-10T12:00:00.000Z"),
      configs,
      new Date("2024-01-10T10:00:00.000Z"),
    );

    expect(results).toEqual([
      {
        notificationTime: new Date("2024-01-10T11:45:00.000Z"),
        isValid: true,
        config: configs[0],
      },
      {
        notificationTime: new Date("2024-01-10T09:00:00.000Z"),
        isValid: false,
        error: "Notification time is in the past",
        config: configs[1],
      },
    ]);
  });

  it("checks whether an event is still in the future", () => {
    expect(
      NotificationCalculator.isEventInFuture(
        new Date("2024-01-10T12:00:00.000Z"),
        new Date("2024-01-10T11:59:59.000Z"),
      ),
    ).toBe(true);

    expect(
      NotificationCalculator.isEventInFuture(
        new Date("2024-01-10T12:00:00.000Z"),
        new Date("2024-01-10T12:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("returns false for invalid inputs when checking future events", () => {
    expect(
      NotificationCalculator.isEventInFuture(
        new Date("invalid"),
        new Date("2024-01-10T11:00:00.000Z"),
      ),
    ).toBe(false);

    expect(
      NotificationCalculator.isEventInFuture(
        new Date("2024-01-10T12:00:00.000Z"),
        new Date("invalid"),
      ),
    ).toBe(false);
  });

  it("returns zero future minutes when the event is already in the past", () => {
    expect(
      NotificationCalculator.getMaxValidMinutesBefore(
        new Date("2024-01-10T12:00:00.000Z"),
        new Date("2024-01-10T12:05:00.000Z"),
      ),
    ).toBe(0);
  });

  it("returns the maximum safe lead time for a future event", () => {
    expect(
      NotificationCalculator.getMaxValidMinutesBefore(
        new Date("2024-01-10T12:00:00.000Z"),
        new Date("2024-01-10T11:30:00.000Z"),
      ),
    ).toBe(29);
  });

  it("formats notification lead times across minutes, hours, and days", () => {
    const eventStart = new Date("2024-01-10T12:00:00.000Z");

    expect(
      NotificationCalculator.formatTimeDifference(eventStart, eventStart),
    ).toBe("at event time");
    expect(
      NotificationCalculator.formatTimeDifference(
        new Date("2024-01-10T11:59:00.000Z"),
        eventStart,
      ),
    ).toBe("1 minute before");
    expect(
      NotificationCalculator.formatTimeDifference(
        new Date("2024-01-10T11:01:00.000Z"),
        eventStart,
      ),
    ).toBe("59 minutes before");
    expect(
      NotificationCalculator.formatTimeDifference(
        new Date("2024-01-10T11:00:00.000Z"),
        eventStart,
      ),
    ).toBe("1 hour before");
    expect(
      NotificationCalculator.formatTimeDifference(
        new Date("2024-01-10T10:30:00.000Z"),
        eventStart,
      ),
    ).toBe("1h 30m before");
    expect(
      NotificationCalculator.formatTimeDifference(
        new Date("2024-01-10T09:00:00.000Z"),
        eventStart,
      ),
    ).toBe("3 hours before");
    expect(
      NotificationCalculator.formatTimeDifference(
        new Date("2024-01-08T12:00:00.000Z"),
        eventStart,
      ),
    ).toBe("2 days before");
    expect(
      NotificationCalculator.formatTimeDifference(
        new Date("2024-01-08T07:00:00.000Z"),
        eventStart,
      ),
    ).toBe("2d 5h before");
  });
});
