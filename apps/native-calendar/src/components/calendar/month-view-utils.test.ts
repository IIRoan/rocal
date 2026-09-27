import type { DecoratedCalendarEvent } from "@workspace/calendar-core";
import { pickerDateToAllDayUtcRange, wallClockToUtc } from "@workspace/calendar-core";
import {
  MONTH_CHIP_GAP,
  MONTH_CHIP_HEIGHT,
  MONTH_DAY_NUMBER_HEIGHT,
  formatMonthChipTime,
  getMonthChipCapacity,
  getMonthDayChipLayout,
} from "./month-view-utils";

const TZ = "Europe/Amsterdam";

function timedEvent(
  id: string,
  day: Date,
  [hour, minute]: [number, number],
  endDay: Date,
  [endHour, endMinute]: [number, number],
): DecoratedCalendarEvent {
  return {
    id,
    title: id,
    start: wallClockToUtc(day, hour, minute, TZ),
    end: wallClockToUtc(endDay, endHour, endMinute, TZ),
    calendarId: "cal-1",
    userId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as DecoratedCalendarEvent;
}

function allDayEvent(id: string, day: Date): DecoratedCalendarEvent {
  const { start, end } = pickerDateToAllDayUtcRange(day, day, TZ);
  return {
    id,
    title: id,
    start,
    end,
    allDay: true,
    timezone: TZ,
    calendarId: "cal-1",
    userId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as DecoratedCalendarEvent;
}

describe("getMonthChipCapacity", () => {
  it("fits one chip when only one row is available", () => {
    expect(
      getMonthChipCapacity(MONTH_DAY_NUMBER_HEIGHT + MONTH_CHIP_GAP + MONTH_CHIP_HEIGHT),
    ).toBe(1);
  });

  it("adds a row per chip height plus gap", () => {
    const threeRowHeight =
      MONTH_DAY_NUMBER_HEIGHT +
      MONTH_CHIP_GAP +
      MONTH_CHIP_HEIGHT * 3 +
      MONTH_CHIP_GAP * 2;
    expect(getMonthChipCapacity(threeRowHeight)).toBe(3);
    expect(getMonthChipCapacity(threeRowHeight - 1)).toBe(2);
  });

  it("returns zero for short cells", () => {
    expect(getMonthChipCapacity(0)).toBe(0);
    expect(getMonthChipCapacity(MONTH_DAY_NUMBER_HEIGHT)).toBe(0);
  });
});

describe("getMonthDayChipLayout", () => {
  const events = ["a", "b", "c", "d"];

  it("shows everything when it fits", () => {
    expect(getMonthDayChipLayout(events, 4)).toEqual({
      visible: events,
      hiddenCount: 0,
    });
  });

  it("reserves the last slot for the overflow count", () => {
    expect(getMonthDayChipLayout(events, 3)).toEqual({
      visible: ["a", "b"],
      hiddenCount: 2,
    });
  });

  it("handles zero capacity", () => {
    expect(getMonthDayChipLayout(events, 0)).toEqual({
      visible: [],
      hiddenCount: 4,
    });
  });
});

describe("formatMonthChipTime", () => {
  const day = new Date(2026, 2, 12);

  it("shows the start time for a timed event on its day", () => {
    const event = timedEvent("standup", day, [9, 30], day, [10, 0]);
    expect(formatMonthChipTime(event, day, "24h", TZ)).toBe("09:30");
    expect(formatMonthChipTime(event, day, "12h", TZ)).toBe("9:30 AM");
  });

  it("is blank for all-day events", () => {
    expect(formatMonthChipTime(allDayEvent("holiday", day), day, "24h", TZ)).toBe(
      "",
    );
  });

  it("shows the time only on the first day of a multi-day event", () => {
    const nextDay = new Date(2026, 2, 13);
    const event = timedEvent("trip", day, [8, 0], nextDay, [18, 0]);
    expect(formatMonthChipTime(event, day, "24h", TZ)).toBe("08:00");
    expect(formatMonthChipTime(event, nextDay, "24h", TZ)).toBe("");
  });
});
