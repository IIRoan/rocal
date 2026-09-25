import {
  formatEventDate,
  formatEventTime,
  formatRecurrenceLabel,
} from "./event-detail-utils";
import type { CalendarEvent } from "@workspace/calendar-core";

function makeEvent(overrides: Record<string, unknown> = {}): CalendarEvent {
  return {
    id: "evt-1",
    title: "Test Event",
    start: new Date(2025, 0, 15, 9, 0).toISOString(),
    end: new Date(2025, 0, 15, 10, 0).toISOString(),
    allDay: false,
    calendarId: "cal-1",
    userId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as CalendarEvent;
}

describe("formatEventDate", () => {
  it("formats a regular event date", () => {
    const event = makeEvent({
      start: "2025-01-15T09:00:00.000Z",
      end: "2025-01-15T10:00:00.000Z",
      timezone: "UTC",
    });
    expect(formatEventDate(event, "UTC")).toBe("Wednesday, January 15, 2025");
  });

  it("formats an all-day event date from inclusive calendar days", () => {
    const event = makeEvent({
      allDay: true,
      start: "2026-06-12T22:00:00.000Z",
      end: "2026-06-13T21:59:59.000Z",
      timezone: "Europe/Amsterdam",
    });
    expect(formatEventDate(event, "Europe/Amsterdam")).toBe(
      "Saturday, June 13, 2026",
    );
  });

  it("does not show the day before for UTC-midnight all-day storage", () => {
    const event = makeEvent({
      allDay: true,
      start: "2026-06-13T00:00:00.000Z",
      end: "2026-06-14T00:00:00.000Z",
      timezone: "Europe/Amsterdam",
    });
    expect(formatEventDate(event, "Europe/Amsterdam")).toBe(
      "Saturday, June 13, 2026",
    );
  });

  it("formats a date at end of year", () => {
    const event = makeEvent({
      start: "2025-12-31T18:00:00.000Z",
      end: "2025-12-31T19:00:00.000Z",
      timezone: "UTC",
    });
    expect(formatEventDate(event, "UTC")).toBe("Wednesday, December 31, 2025");
  });
});

describe("formatEventTime", () => {
  it("returns 'All day' for all-day events", () => {
    const event = makeEvent({ allDay: true });
    expect(formatEventTime(event, undefined, "24h")).toBe("All day");
  });

  it("formats a morning event time range", () => {
    const event = makeEvent({
      start: "2025-01-15T09:00:00.000Z",
      end: "2025-01-15T10:00:00.000Z",
      timezone: "UTC",
    });
    expect(formatEventTime(event, "UTC", "12h")).toBe("9:00 AM – 10:00 AM");
  });

  it("formats a PM event time range", () => {
    const event = makeEvent({
      start: "2025-01-15T14:30:00.000Z",
      end: "2025-01-15T16:00:00.000Z",
      timezone: "UTC",
    });
    expect(formatEventTime(event, "UTC", "12h")).toBe("2:30 PM – 4:00 PM");
  });

  it("formats noon correctly", () => {
    const event = makeEvent({
      start: "2025-01-15T12:00:00.000Z",
      end: "2025-01-15T13:00:00.000Z",
      timezone: "UTC",
    });
    expect(formatEventTime(event, "UTC", "12h")).toBe("12:00 PM – 1:00 PM");
  });

  it("formats midnight correctly", () => {
    const event = makeEvent({
      start: "2025-01-15T00:00:00.000Z",
      end: "2025-01-15T01:00:00.000Z",
      timezone: "UTC",
    });
    expect(formatEventTime(event, "UTC", "12h")).toBe("12:00 AM – 1:00 AM");
  });

  it("uses a 24-hour clock when the user picked 24h", () => {
    const event = makeEvent({
      start: "2025-01-15T14:30:00.000Z",
      end: "2025-01-15T16:00:00.000Z",
      timezone: "UTC",
    });
    expect(formatEventTime(event, "UTC", "24h")).toBe("14:30 – 16:00");
  });
});

describe("formatRecurrenceLabel", () => {
  it("formats RRULE weekly days into readable copy", () => {
    expect(formatRecurrenceLabel("FREQ=WEEKLY;BYDAY=MO,WE,FR")).toBe(
      "Weekly on Mon, Wed, Fri",
    );
  });

  it("formats a JSON recurrence rule the same way as web", () => {
    expect(
      formatRecurrenceLabel(
        JSON.stringify({
          frequency: "weekly",
          interval: 2,
          byWeekDay: [1, 3, 5],
          count: 10,
        }),
      ),
    ).toBe("Every 2 weeks on Mon, Wed, Fri, 10 times");
  });

  it("formats a monthly rule that ends on a date", () => {
    expect(formatRecurrenceLabel("FREQ=MONTHLY;UNTIL=20260501")).toBe(
      "Monthly, until May 1, 2026",
    );
  });

  it("returns Repeats when the payload cannot be parsed", () => {
    expect(formatRecurrenceLabel("not-a-rule")).toBe("Repeats");
  });

  it("returns null when there is no recurrence", () => {
    expect(formatRecurrenceLabel(null)).toBeNull();
    expect(formatRecurrenceLabel("")).toBeNull();
  });
});
