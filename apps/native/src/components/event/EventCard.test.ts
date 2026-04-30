import { formatTimeRange } from "./event-card-utils";
import type { DecoratedCalendarEvent } from "@workspace/calendar-core";

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeEvent(
  overrides: Partial<DecoratedCalendarEvent> = {},
): DecoratedCalendarEvent {
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
  } as DecoratedCalendarEvent;
}

// ─── formatTimeRange ─────────────────────────────────────────────────────────

describe("formatTimeRange", () => {
  it("returns 'All day' for all-day events", () => {
    const event = makeEvent({ allDay: true });
    expect(formatTimeRange(event, "12h")).toBe("All day");
    expect(formatTimeRange(event, "24h")).toBe("All day");
  });

  it("formats time in 12h format", () => {
    const event = makeEvent({
      start: new Date(2025, 0, 15, 9, 0).toISOString(),
      end: new Date(2025, 0, 15, 10, 0).toISOString(),
    });
    const result = formatTimeRange(event, "12h");
    expect(result).toMatch(/9am\s*–\s*10am/);
  });

  it("formats time in 24h format", () => {
    const event = makeEvent({
      start: new Date(2025, 0, 15, 9, 0).toISOString(),
      end: new Date(2025, 0, 15, 10, 0).toISOString(),
    });
    const result = formatTimeRange(event, "24h");
    expect(result).toMatch(/09:00\s*–\s*10:00/);
  });

  it("formats PM times in 12h format", () => {
    const event = makeEvent({
      start: new Date(2025, 0, 15, 14, 0).toISOString(),
      end: new Date(2025, 0, 15, 15, 30).toISOString(),
    });
    const result = formatTimeRange(event, "12h");
    expect(result).toMatch(/2pm\s*–\s*3pm/);
  });

  it("formats afternoon times in 24h format", () => {
    const event = makeEvent({
      start: new Date(2025, 0, 15, 14, 0).toISOString(),
      end: new Date(2025, 0, 15, 15, 30).toISOString(),
    });
    const result = formatTimeRange(event, "24h");
    expect(result).toMatch(/14:00\s*–\s*15:30/);
  });

  it("formats midnight correctly in 12h format", () => {
    const event = makeEvent({
      start: new Date(2025, 0, 15, 0, 0).toISOString(),
      end: new Date(2025, 0, 15, 1, 0).toISOString(),
    });
    const result = formatTimeRange(event, "12h");
    expect(result).toMatch(/12am\s*–\s*1am/);
  });

  it("formats noon correctly in 12h format", () => {
    const event = makeEvent({
      start: new Date(2025, 0, 15, 12, 0).toISOString(),
      end: new Date(2025, 0, 15, 13, 0).toISOString(),
    });
    const result = formatTimeRange(event, "12h");
    expect(result).toMatch(/12pm\s*–\s*1pm/);
  });

  it("formats events spanning midnight (PM start, AM end)", () => {
    const event = makeEvent({
      start: new Date(2025, 0, 15, 22, 0).toISOString(),
      end: new Date(2025, 0, 16, 2, 0).toISOString(),
    });
    const result12 = formatTimeRange(event, "12h");
    expect(result12).toMatch(/10pm\s*–\s*2am/);

    const result24 = formatTimeRange(event, "24h");
    expect(result24).toMatch(/22:00\s*–\s*02:00/);
  });

  it("formats events with minutes in 24h format", () => {
    const event = makeEvent({
      start: new Date(2025, 0, 15, 9, 30).toISOString(),
      end: new Date(2025, 0, 15, 10, 45).toISOString(),
    });
    const result = formatTimeRange(event, "24h");
    expect(result).toMatch(/09:30\s*–\s*10:45/);
  });

  it("formats events with minutes in 12h format (shows hour only)", () => {
    const event = makeEvent({
      start: new Date(2025, 0, 15, 9, 30).toISOString(),
      end: new Date(2025, 0, 15, 10, 45).toISOString(),
    });
    // 12h compact format uses 'haaa' which shows hour + am/pm without minutes
    const result = formatTimeRange(event, "12h");
    expect(result).toMatch(/9am\s*–\s*10am/);
  });
});
