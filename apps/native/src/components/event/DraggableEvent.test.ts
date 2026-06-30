import type { DecoratedCalendarEvent } from "@workspace/calendar-core";
import { formatInUserTimezone } from "@workspace/calendar-core";
import {
  getEventDurationMs,
  snapToInterval,
  yOffsetToTime,
  xOffsetToColumnIndex,
  computeRescheduledTimes,
  findEventColumnIndex,
} from "./draggable-event-utils";
import { HOUR_HEIGHT } from "../calendar/timeline-utils";

const TEST_TIMEZONE = "UTC";

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

function expectZonedTime(
  instant: Date,
  hour: number,
  minute: number,
): void {
  expect(formatInUserTimezone(instant, TEST_TIMEZONE, "HH:mm")).toBe(
    `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  );
}

function expectZonedDate(instant: Date, day: number): void {
  expect(formatInUserTimezone(instant, TEST_TIMEZONE, "d")).toBe(String(day));
}

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

// ─── getEventDurationMs ──────────────────────────────────────────────────────

describe("getEventDurationMs", () => {
  it("returns the duration in milliseconds between two dates", () => {
    const start = new Date(2025, 0, 15, 9, 0);
    const end = new Date(2025, 0, 15, 10, 0);
    expect(getEventDurationMs(start, end)).toBe(60 * 60 * 1000);
  });

  it("returns 0 for same start and end", () => {
    const date = new Date(2025, 0, 15, 9, 0);
    expect(getEventDurationMs(date, date)).toBe(0);
  });

  it("handles multi-hour events", () => {
    const start = new Date(2025, 0, 15, 9, 0);
    const end = new Date(2025, 0, 15, 12, 30);
    expect(getEventDurationMs(start, end)).toBe(3.5 * 60 * 60 * 1000);
  });
});

// ─── snapToInterval ──────────────────────────────────────────────────────────

describe("snapToInterval", () => {
  it("snaps to nearest 15-minute boundary", () => {
    expect(snapToInterval(0)).toBe(0);
    expect(snapToInterval(7)).toBe(0);
    expect(snapToInterval(8)).toBe(15);
    expect(snapToInterval(15)).toBe(15);
    expect(snapToInterval(22)).toBe(15);
    expect(snapToInterval(23)).toBe(30);
    expect(snapToInterval(30)).toBe(30);
    expect(snapToInterval(45)).toBe(45);
    expect(snapToInterval(60)).toBe(60);
  });

  it("handles exact boundaries", () => {
    expect(snapToInterval(120)).toBe(120);
    expect(snapToInterval(180)).toBe(180);
  });
});

// ─── yOffsetToTime ───────────────────────────────────────────────────────────

describe("yOffsetToTime", () => {
  it("converts 0 offset to midnight", () => {
    const result = yOffsetToTime(0, HOUR_HEIGHT);
    expect(result.hour).toBe(0);
    expect(result.minute).toBe(0);
  });

  it("converts offset at 9 hours to 9:00", () => {
    const result = yOffsetToTime(9 * HOUR_HEIGHT, HOUR_HEIGHT);
    expect(result.hour).toBe(9);
    expect(result.minute).toBe(0);
  });

  it("converts offset at 9.5 hours to 9:30", () => {
    const result = yOffsetToTime(9.5 * HOUR_HEIGHT, HOUR_HEIGHT);
    expect(result.hour).toBe(9);
    expect(result.minute).toBe(30);
  });

  it("clamps negative offsets to 0:00", () => {
    const result = yOffsetToTime(-100, HOUR_HEIGHT);
    expect(result.hour).toBe(0);
    expect(result.minute).toBe(0);
  });

  it("clamps offsets beyond 24 hours to 23:45", () => {
    const result = yOffsetToTime(25 * HOUR_HEIGHT, HOUR_HEIGHT);
    expect(result.hour).toBe(23);
    expect(result.minute).toBe(45);
  });
});

// ─── xOffsetToColumnIndex ────────────────────────────────────────────────────

describe("xOffsetToColumnIndex", () => {
  it("returns 0 for offset in the first column", () => {
    expect(xOffsetToColumnIndex(10, 50, 7)).toBe(0);
  });

  it("returns correct column for middle offset", () => {
    expect(xOffsetToColumnIndex(125, 50, 7)).toBe(2);
  });

  it("clamps negative offsets to 0", () => {
    expect(xOffsetToColumnIndex(-10, 50, 7)).toBe(0);
  });

  it("clamps offsets beyond last column", () => {
    expect(xOffsetToColumnIndex(500, 50, 7)).toBe(6);
  });

  it("works with single column (day view)", () => {
    expect(xOffsetToColumnIndex(100, 300, 1)).toBe(0);
  });

  it("works with 3 columns (three-day view)", () => {
    expect(xOffsetToColumnIndex(250, 100, 3)).toBe(2);
  });
});

// ─── computeRescheduledTimes ─────────────────────────────────────────────────

describe("computeRescheduledTimes", () => {
  it("preserves event duration when rescheduling to a new time", () => {
    const event = makeEvent({
      start: "2025-01-15T09:00:00.000Z",
      end: "2025-01-15T10:00:00.000Z",
    });
    const dropTarget = {
      date: utcDate(2025, 0, 15),
      hour: 14,
      minute: 0,
    };

    const { newStart, newEnd } = computeRescheduledTimes(
      event,
      dropTarget,
      TEST_TIMEZONE,
    );

    const originalDuration =
      new Date(event.end).getTime() - new Date(event.start).getTime();
    expect(newEnd.getTime() - newStart.getTime()).toBe(originalDuration);
    expectZonedTime(newStart, 14, 0);
  });

  it("preserves duration when moving to a different day", () => {
    const event = makeEvent({
      start: "2025-01-15T09:00:00.000Z",
      end: "2025-01-15T11:30:00.000Z",
    });
    const dropTarget = {
      date: utcDate(2025, 0, 17),
      hour: 10,
      minute: 15,
    };

    const { newStart, newEnd } = computeRescheduledTimes(
      event,
      dropTarget,
      TEST_TIMEZONE,
    );

    const originalDuration =
      new Date(event.end).getTime() - new Date(event.start).getTime();
    expect(newEnd.getTime() - newStart.getTime()).toBe(originalDuration);
    expectZonedDate(newStart, 17);
    expectZonedTime(newStart, 10, 15);
    expectZonedDate(newEnd, 17);
    expectZonedTime(newEnd, 12, 45);
  });

  it("preserves duration for short events (15 min)", () => {
    const event = makeEvent({
      start: "2025-01-15T09:00:00.000Z",
      end: "2025-01-15T09:15:00.000Z",
    });
    const dropTarget = {
      date: utcDate(2025, 0, 15),
      hour: 16,
      minute: 30,
    };

    const { newStart, newEnd } = computeRescheduledTimes(
      event,
      dropTarget,
      TEST_TIMEZONE,
    );

    expect(newEnd.getTime() - newStart.getTime()).toBe(15 * 60 * 1000);
    expectZonedTime(newStart, 16, 30);
  });

  it("handles drop at midnight", () => {
    const event = makeEvent({
      start: "2025-01-15T09:00:00.000Z",
      end: "2025-01-15T10:00:00.000Z",
    });
    const dropTarget = {
      date: utcDate(2025, 0, 16),
      hour: 0,
      minute: 0,
    };

    const { newStart, newEnd } = computeRescheduledTimes(
      event,
      dropTarget,
      TEST_TIMEZONE,
    );

    expectZonedTime(newStart, 0, 0);
    expectZonedTime(newEnd, 1, 0);
  });
});

// ─── findEventColumnIndex ────────────────────────────────────────────────────

describe("findEventColumnIndex", () => {
  const weekDates = [
    new Date(2025, 0, 13), // Mon
    new Date(2025, 0, 14), // Tue
    new Date(2025, 0, 15), // Wed
    new Date(2025, 0, 16), // Thu
    new Date(2025, 0, 17), // Fri
    new Date(2025, 0, 18), // Sat
    new Date(2025, 0, 19), // Sun
  ];

  it("returns the correct column index for a matching date", () => {
    const eventStart = new Date(2025, 0, 15, 9, 0); // Wed
    expect(findEventColumnIndex(eventStart, weekDates)).toBe(2);
  });

  it("returns 0 when the event date is not in the column dates", () => {
    const eventStart = new Date(2025, 0, 20, 9, 0); // Not in week
    expect(findEventColumnIndex(eventStart, weekDates)).toBe(0);
  });

  it("works with single-column (day view)", () => {
    const singleDay = [new Date(2025, 0, 15)];
    const eventStart = new Date(2025, 0, 15, 14, 30);
    expect(findEventColumnIndex(eventStart, singleDay)).toBe(0);
  });

  it("works with three-day view", () => {
    const threeDays = [
      new Date(2025, 0, 14),
      new Date(2025, 0, 15),
      new Date(2025, 0, 16),
    ];
    const eventStart = new Date(2025, 0, 16, 10, 0);
    expect(findEventColumnIndex(eventStart, threeDays)).toBe(2);
  });
});
