import { describe, expect, it } from "@jest/globals";
import { addDays, isSameDay } from "date-fns";

import type { CalendarEvent } from "./types";
import {
  getThreeDayAllDayEvents,
  getThreeDayCalendarDays,
  getThreeDayLocalRangeBounds,
  getThreeDayTimelineScrollTop,
  groupThreeDayAllDayEventsByDay,
} from "./three-day-view-utils";
import { WeekCellsHeight } from "./constants";

function createEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-1",
    title: "Event",
    start: "2026-06-16T10:00:00.000Z",
    end: "2026-06-16T11:00:00.000Z",
    allDay: false,
    color: "blue",
    ...overrides,
  };
}

describe("getThreeDayCalendarDays", () => {
  it("centers the visible range on the base date", () => {
    const baseDate = new Date(2026, 5, 16);
    const days = getThreeDayCalendarDays(baseDate);

    expect(days).toHaveLength(3);
    expect(isSameDay(days[0]!, addDays(baseDate, -1))).toBe(true);
    expect(isSameDay(days[1]!, baseDate)).toBe(true);
    expect(isSameDay(days[2]!, addDays(baseDate, 1))).toBe(true);
  });
});

describe("getThreeDayLocalRangeBounds", () => {
  it("spans from the start of the first day to the end of the last day", () => {
    const days = getThreeDayCalendarDays(new Date(2026, 5, 16));
    const { rangeStart, rangeEnd } = getThreeDayLocalRangeBounds(days);

    expect(rangeStart).toEqual(new Date(2026, 5, 15, 0, 0, 0, 0));
    expect(rangeEnd).toEqual(new Date(2026, 5, 17, 23, 59, 59, 999));
  });
});

describe("getThreeDayTimelineScrollTop", () => {
  const days = getThreeDayCalendarDays(new Date(2026, 5, 16));

  it("scrolls to the default hour when today is not visible", () => {
    expect(
      getThreeDayTimelineScrollTop(days, "Europe/Amsterdam", {
        defaultHour: 9,
        leadingCellOffset: 1,
        now: new Date("2026-06-20T12:00:00.000Z"),
      }),
    ).toBe(8 * WeekCellsHeight);
  });

  it("scrolls to the current time when today is in the visible range", () => {
    const now = new Date("2026-06-16T10:30:00.000Z");
    const days = getThreeDayCalendarDays(new Date(2026, 5, 16));

    expect(
      getThreeDayTimelineScrollTop(days, "Europe/Amsterdam", {
        leadingCellOffset: 1,
        now,
      }),
    ).toBe(11.5 * WeekCellsHeight);
  });

  it("never returns a negative scroll offset", () => {
    expect(
      getThreeDayTimelineScrollTop(days, "Europe/Amsterdam", {
        defaultHour: 0,
        leadingCellOffset: 2,
        now: new Date("2026-06-20T00:15:00.000Z"),
      }),
    ).toBe(0);
  });
});

describe("three-day all-day event helpers", () => {
  const baseDate = new Date(2026, 5, 16);
  const timezone = "Europe/Amsterdam";

  it("includes all-day events that overlap the visible 3-day window", () => {
    const events = [
      createEvent({
        id: "in-range",
        allDay: true,
        start: "2026-06-15T00:00:00.000Z",
        end: "2026-06-16T00:00:00.000Z",
      }),
      createEvent({
        id: "out-of-range",
        allDay: true,
        start: "2026-06-10T00:00:00.000Z",
        end: "2026-06-11T00:00:00.000Z",
      }),
    ];

    expect(getThreeDayAllDayEvents(events, baseDate, timezone).map((event) => event.id)).toEqual(
      ["in-range"],
    );
  });

  it("groups multi-day all-day events across inclusive days only", () => {
    const events = [
      createEvent({
        id: "spanning",
        allDay: true,
        start: "2026-06-19T22:00:00.000Z",
        end: "2026-06-22T22:00:00.000Z",
      }),
    ];

    const grouped = groupThreeDayAllDayEventsByDay(
      events,
      new Date(2026, 5, 20),
      timezone,
    );

    expect(grouped.flat().filter((event) => event.id === "spanning")).toHaveLength(
      2,
    );
    expect(grouped[0]!.map((event) => event.id)).toEqual([]);
    expect(grouped[1]!.map((event) => event.id)).toEqual(["spanning"]);
    expect(grouped[2]!.map((event) => event.id)).toEqual(["spanning"]);
  });

  it("keeps timed events out of the all-day grouping", () => {
    const events = [
      createEvent({
        id: "timed",
        start: "2026-06-16T10:00:00.000Z",
        end: "2026-06-16T11:00:00.000Z",
      }),
    ];

    expect(getThreeDayAllDayEvents(events, baseDate, timezone)).toEqual([]);
    expect(groupThreeDayAllDayEventsByDay(events, baseDate, timezone)).toEqual([
      [],
      [],
      [],
    ]);
  });

  it("places timed multi-day events in the all-day grouping", () => {
    const events = [
      createEvent({
        id: "multiday",
        start: "2026-06-15T05:45:00.000Z",
        end: "2026-06-17T06:45:00.000Z",
      }),
    ];

    const grouped = groupThreeDayAllDayEventsByDay(events, baseDate, timezone);

    expect(getThreeDayAllDayEvents(events, baseDate, timezone).map((event) => event.id)).toEqual(
      ["multiday"],
    );
    expect(grouped.map((dayEvents) => dayEvents.map((event) => event.id))).toEqual([
      ["multiday"],
      ["multiday"],
      ["multiday"],
    ]);
  });

  it("sorts multi-day all-day events before single-day events within each column", () => {
    const events = [
      createEvent({
        id: "single",
        allDay: true,
        start: "2026-06-19T22:00:00.000Z",
        end: "2026-06-20T22:00:00.000Z",
      }),
      createEvent({
        id: "multi",
        allDay: true,
        start: "2026-06-19T22:00:00.000Z",
        end: "2026-06-22T22:00:00.000Z",
      }),
    ];

    const grouped = groupThreeDayAllDayEventsByDay(
      events,
      new Date(2026, 5, 20),
      timezone,
    );

    expect(grouped[1]!.map((event) => event.id)).toEqual(["multi", "single"]);
  });

  it("does not place a Friday all-day event in the Saturday column", () => {
    const events = [
      createEvent({
        id: "friday-all-day",
        allDay: true,
        start: "2026-06-19T00:00:00.000Z",
        end: "2026-06-20T00:00:00.000Z",
      }),
    ];

    const grouped = groupThreeDayAllDayEventsByDay(
      events,
      new Date(2026, 5, 20),
      timezone,
    );

    expect(grouped[0]!.map((event) => event.id)).toEqual(["friday-all-day"]);
    expect(grouped[1]!.map((event) => event.id)).toEqual([]);
    expect(grouped[2]!.map((event) => event.id)).toEqual([]);
  });
});
