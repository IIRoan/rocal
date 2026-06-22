import {
  formatEventDate,
  formatEventTime,
  formatReminderLabel,
} from "./event-detail-utils";
import type { CalendarEvent } from "@workspace/calendar-core";

// ─── Test Helpers ────────────────────────────────────────────────────────────

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

// ─── formatEventDate ─────────────────────────────────────────────────────────

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

// ─── formatEventTime ─────────────────────────────────────────────────────────

describe("formatEventTime", () => {
  it("returns 'All day' for all-day events", () => {
    const event = makeEvent({ allDay: true });
    expect(formatEventTime(event)).toBe("All day");
  });

  it("formats a morning event time range", () => {
    const event = makeEvent({
      start: "2025-01-15T09:00:00.000Z",
      end: "2025-01-15T10:00:00.000Z",
      timezone: "UTC",
    });
    expect(formatEventTime(event, "UTC")).toBe("9:00 AM – 10:00 AM");
  });

  it("formats a PM event time range", () => {
    const event = makeEvent({
      start: "2025-01-15T14:30:00.000Z",
      end: "2025-01-15T16:00:00.000Z",
      timezone: "UTC",
    });
    expect(formatEventTime(event, "UTC")).toBe("2:30 PM – 4:00 PM");
  });

  it("formats noon correctly", () => {
    const event = makeEvent({
      start: "2025-01-15T12:00:00.000Z",
      end: "2025-01-15T13:00:00.000Z",
      timezone: "UTC",
    });
    expect(formatEventTime(event, "UTC")).toBe("12:00 PM – 1:00 PM");
  });

  it("formats midnight correctly", () => {
    const event = makeEvent({
      start: "2025-01-15T00:00:00.000Z",
      end: "2025-01-15T01:00:00.000Z",
      timezone: "UTC",
    });
    expect(formatEventTime(event, "UTC")).toBe("12:00 AM – 1:00 AM");
  });
});

// ─── formatReminderLabel ─────────────────────────────────────────────────────

describe("formatReminderLabel", () => {
  it("returns 'At time of event' for 0 minutes", () => {
    expect(formatReminderLabel(0)).toBe("At time of event");
  });

  it("returns singular minute label for 1 minute", () => {
    expect(formatReminderLabel(1)).toBe("1 minute before");
  });

  it("returns plural minutes label for 5 minutes", () => {
    expect(formatReminderLabel(5)).toBe("5 minutes before");
  });

  it("returns hour label for exactly 60 minutes", () => {
    expect(formatReminderLabel(60)).toBe("1 hour before");
  });

  it("returns plural hours label for 120 minutes", () => {
    expect(formatReminderLabel(120)).toBe("2 hours before");
  });

  it("returns mixed hours and minutes for 90 minutes", () => {
    expect(formatReminderLabel(90)).toBe("1h 30m before");
  });
});
