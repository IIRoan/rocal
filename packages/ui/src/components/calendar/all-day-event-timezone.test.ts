import { describe, expect, it } from "@jest/globals";
import { pickerDateToAllDayUtcRange } from "@workspace/calendar-core";

import { layoutAllDayRowEvents } from "./all-day-layout";
import { buildDraggedEventUpdate } from "./event-calendar-mutations";
import type { CalendarEvent } from "./types";
import {
  getAgendaEventsForDay,
  getAllEventsForDay,
  getEventSegmentForCalendarDay,
  getEventsForDay,
  getSpanningEventsForDay,
  isAllDayRowEvent,
  isMultiDayEvent,
} from "./utils";

const SAVED_IN = "Europe/Amsterdam";
const VIEWER_TIMEZONES = [
  "Europe/Amsterdam",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "Pacific/Kiritimati",
];
const week = Array.from({ length: 7 }, (_, index) => new Date(2026, 8, 21 + index));

function createAllDayEvent(
  firstDay: Date,
  lastDay: Date,
  timezone: string,
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  const { start, end } = pickerDateToAllDayUtcRange(firstDay, lastDay, timezone);
  return {
    id: "all-day",
    title: "All day",
    start,
    end,
    allDay: true,
    timezone,
    color: "blue",
    ...overrides,
  };
}

function ids(events: CalendarEvent[]) {
  return events.map((event) => event.id);
}

describe("all-day events rendered in another timezone", () => {
  const tuesday = new Date(2026, 8, 22);
  const singleDay = createAllDayEvent(tuesday, tuesday, SAVED_IN);

  for (const viewer of VIEWER_TIMEZONES) {
    describe(`viewer in ${viewer}`, () => {
      it("renders a single-day event as one card in the week all-day row", () => {
        const { placements, laneCount } = layoutAllDayRowEvents([singleDay], week, viewer);

        expect(laneCount).toBe(1);
        expect(placements).toEqual([
          expect.objectContaining({
            startIndex: 1,
            span: 1,
            continuesBefore: false,
            continuesAfter: false,
          }),
        ]);
      });

      it("lists the event only on its saved day in month, day and agenda buckets", () => {
        for (const day of week) {
          const expected = day.getDate() === 22 ? ["all-day"] : [];

          expect(ids(getAllEventsForDay([singleDay], day, viewer))).toEqual(expected);
          expect(ids(getAgendaEventsForDay([singleDay], day, viewer))).toEqual(expected);
          expect(ids(getEventsForDay([singleDay], day, viewer))).toEqual(expected);
          expect(ids(getSpanningEventsForDay([singleDay], day, viewer))).toEqual([]);
        }
      });

      it("treats the event as a rounded single-day segment", () => {
        expect(isMultiDayEvent(singleDay, viewer)).toBe(false);
        expect(isAllDayRowEvent(singleDay, viewer)).toBe(true);
        expect(getEventSegmentForCalendarDay(singleDay, tuesday, viewer)).toEqual({
          isFirstDay: true,
          isLastDay: true,
        });
      });

      it("spans exactly three columns for a three-day event", () => {
        const trip = createAllDayEvent(
          new Date(2026, 8, 23),
          new Date(2026, 8, 25),
          SAVED_IN,
          { id: "trip" },
        );
        const { placements } = layoutAllDayRowEvents([trip], week, viewer);

        expect(placements).toEqual([expect.objectContaining({ startIndex: 2, span: 3 })]);
        expect(ids(getSpanningEventsForDay([trip], new Date(2026, 8, 24), viewer))).toEqual([
          "trip",
        ]);
        expect(ids(getEventsForDay([trip], new Date(2026, 8, 23), viewer))).toEqual(["trip"]);
        expect(
          getEventSegmentForCalendarDay(trip, new Date(2026, 8, 25), viewer),
        ).toEqual({ isFirstDay: false, isLastDay: true });
      });
    });
  }

  it("keeps a single day across the Amsterdam autumn DST change", () => {
    const dstSunday = new Date(2026, 9, 25);
    const event = createAllDayEvent(dstSunday, dstSunday, SAVED_IN);
    const dstWeek = Array.from({ length: 7 }, (_, index) => new Date(2026, 9, 19 + index));

    for (const viewer of VIEWER_TIMEZONES) {
      expect(layoutAllDayRowEvents([event], dstWeek, viewer).placements).toEqual([
        expect.objectContaining({ startIndex: 6, span: 1 }),
      ]);
    }
  });

  it("renders legacy UTC-encoded all-day events on one day", () => {
    const legacy: CalendarEvent = {
      id: "legacy",
      title: "Legacy",
      start: new Date("2026-09-22T00:00:00.000Z"),
      end: new Date("2026-09-22T23:59:59.000Z"),
      allDay: true,
      timezone: SAVED_IN,
      color: "blue",
    };

    for (const viewer of VIEWER_TIMEZONES) {
      expect(layoutAllDayRowEvents([legacy], week, viewer).placements).toEqual([
        expect.objectContaining({ startIndex: 1, span: 1 }),
      ]);
    }
  });
});

describe("buildDraggedEventUpdate timezone", () => {
  it("sends the timezone the new times were computed in", () => {
    const moved = createAllDayEvent(
      new Date(2026, 8, 24),
      new Date(2026, 8, 24),
      "America/New_York",
    );

    expect(buildDraggedEventUpdate(moved, "America/New_York")).toEqual({
      start: "2026-09-24T04:00:00.000Z",
      end: "2026-09-25T03:59:59.000Z",
      allDay: true,
      timezone: "America/New_York",
    });
  });
});
