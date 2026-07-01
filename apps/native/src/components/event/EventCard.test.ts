import { formatTimeRange } from "./event-card-utils";
import type { DecoratedCalendarEvent } from "@workspace/calendar-core";

const TEST_TIMEZONE = "UTC";

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeEvent(
  overrides: Record<string, unknown> = {},
): DecoratedCalendarEvent {
  return {
    id: "evt-1",
    title: "Test Event",
    start: "2025-01-15T09:00:00.000Z",
    end: "2025-01-15T10:00:00.000Z",
    timezone: TEST_TIMEZONE,
    allDay: false,
    calendarId: "cal-1",
    userId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as DecoratedCalendarEvent;
}

// ─── formatTimeRange ─────────────────────────────────────────────────────────

describe("formatTimeRange", () => {
  it("returns 'All day' for all-day events", () => {
    const event = makeEvent({ allDay: true });
    expect(formatTimeRange(event, "12h", TEST_TIMEZONE)).toBe("All day");
    expect(formatTimeRange(event, "24h", TEST_TIMEZONE)).toBe("All day");
  });

  it("formats time in 12h format", () => {
    const event = makeEvent({
      start: "2025-01-15T09:00:00.000Z",
      end: "2025-01-15T10:00:00.000Z",
    });
    const result = formatTimeRange(event, "12h", TEST_TIMEZONE);
    expect(result).toMatch(/9am\s*–\s*10am/);
  });

  it("formats time in 24h format", () => {
    const event = makeEvent({
      start: "2025-01-15T09:00:00.000Z",
      end: "2025-01-15T10:00:00.000Z",
    });
    const result = formatTimeRange(event, "24h", TEST_TIMEZONE);
    expect(result).toMatch(/09:00\s*–\s*10:00/);
  });

  it("formats PM times in 12h format", () => {
    const event = makeEvent({
      start: "2025-01-15T14:00:00.000Z",
      end: "2025-01-15T15:30:00.000Z",
    });
    const result = formatTimeRange(event, "12h", TEST_TIMEZONE);
    expect(result).toMatch(/2pm\s*–\s*3pm/);
  });

  it("formats afternoon times in 24h format", () => {
    const event = makeEvent({
      start: "2025-01-15T14:00:00.000Z",
      end: "2025-01-15T15:30:00.000Z",
    });
    const result = formatTimeRange(event, "24h", TEST_TIMEZONE);
    expect(result).toMatch(/14:00\s*–\s*15:30/);
  });

  it("formats midnight correctly in 12h format", () => {
    const event = makeEvent({
      start: "2025-01-15T00:00:00.000Z",
      end: "2025-01-15T01:00:00.000Z",
    });
    const result = formatTimeRange(event, "12h", TEST_TIMEZONE);
    expect(result).toMatch(/12am\s*–\s*1am/);
  });

  it("formats noon correctly in 12h format", () => {
    const event = makeEvent({
      start: "2025-01-15T12:00:00.000Z",
      end: "2025-01-15T13:00:00.000Z",
    });
    const result = formatTimeRange(event, "12h", TEST_TIMEZONE);
    expect(result).toMatch(/12pm\s*–\s*1pm/);
  });

  it("formats events spanning midnight (PM start, AM end)", () => {
    const event = makeEvent({
      start: "2025-01-15T22:00:00.000Z",
      end: "2025-01-16T02:00:00.000Z",
    });
    const result12 = formatTimeRange(event, "12h", TEST_TIMEZONE);
    expect(result12).toMatch(/10pm\s*–\s*2am/);

    const result24 = formatTimeRange(event, "24h", TEST_TIMEZONE);
    expect(result24).toMatch(/22:00\s*–\s*02:00/);
  });

  it("formats events with minutes in 24h format", () => {
    const event = makeEvent({
      start: "2025-01-15T09:30:00.000Z",
      end: "2025-01-15T10:45:00.000Z",
    });
    const result = formatTimeRange(event, "24h", TEST_TIMEZONE);
    expect(result).toMatch(/09:30\s*–\s*10:45/);
  });

  it("formats events with minutes in 12h format (shows hour only)", () => {
    const event = makeEvent({
      start: "2025-01-15T09:30:00.000Z",
      end: "2025-01-15T10:45:00.000Z",
    });
    // 12h compact format uses 'haaa' which shows hour + am/pm without minutes
    const result = formatTimeRange(event, "12h", TEST_TIMEZONE);
    expect(result).toMatch(/9am\s*–\s*10am/);
  });
});
