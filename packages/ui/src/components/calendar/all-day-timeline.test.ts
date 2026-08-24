import { describe, expect, it } from "@jest/globals";
import { pickerDateToAllDayUtcRange } from "@workspace/calendar-core";

import type { CalendarEvent } from "./types";
import {
  eventOverlapsRange,
  getEventSegmentForCalendarDay,
  getTimedTimelineEventsForDay,
  isMultiDayEvent,
} from "./utils";
import { groupThreeDayAllDayEventsByDay } from "./three-day-view-utils";

const timezone = "Europe/Amsterdam";
const friday = new Date(2026, 5, 19);
const saturday = new Date(2026, 5, 20);
const sunday = new Date(2026, 5, 21);

function createEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-1",
    title: "Event",
    start: "2026-06-20T10:00:00.000Z",
    end: "2026-06-20T11:00:00.000Z",
    allDay: false,
    color: "blue",
    ...overrides,
  };
}

describe("Friday all-day event does not leak to Saturday", () => {
  const utcMidnightFriday = createEvent({
    id: "utc-midnight",
    allDay: true,
    start: "2026-06-19T00:00:00.000Z",
    end: "2026-06-20T00:00:00.000Z",
  });

  const zonedExclusiveFriday = createEvent({
    id: "zoned-exclusive",
    allDay: true,
    start: "2026-06-18T22:00:00.000Z",
    end: "2026-06-19T22:00:00.000Z",
  });

  const pickerRangeFriday = (() => {
    const range = pickerDateToAllDayUtcRange(friday, friday, timezone);
    return createEvent({
      id: "picker-range",
      allDay: true,
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    });
  })();

  const fridayAllDayVariants = [
    ["UTC midnight boundaries", utcMidnightFriday],
    ["zoned exclusive midnight end", zonedExclusiveFriday],
    ["pickerDateToAllDayUtcRange", pickerRangeFriday],
  ] as const;

  it.each(fridayAllDayVariants)(
    "is single-day for %s",
    (_label, event) => {
      expect(isMultiDayEvent(event, timezone)).toBe(false);
    },
  );

  it.each(fridayAllDayVariants)(
    "overlaps Friday but not Saturday in the all-day row for %s",
    (_label, event) => {
      expect(
        eventOverlapsRange(event, friday, friday, "day", timezone),
      ).toBe(true);
      expect(
        eventOverlapsRange(event, saturday, saturday, "day", timezone),
      ).toBe(false);
    },
  );

  it.each(fridayAllDayVariants)(
    "segments only on Friday for %s",
    (_label, event) => {
      expect(getEventSegmentForCalendarDay(event, friday, timezone)).toEqual({
        isFirstDay: true,
        isLastDay: true,
      });
      expect(getEventSegmentForCalendarDay(event, saturday, timezone)).toEqual({
        isFirstDay: false,
        isLastDay: false,
      });
    },
  );

  it.each(fridayAllDayVariants)(
    "never appears in the hourly timeline for %s",
    (_label, event) => {
      expect(getTimedTimelineEventsForDay([event], friday, timezone)).toEqual(
        [],
      );
      expect(getTimedTimelineEventsForDay([event], saturday, timezone)).toEqual(
        [],
      );
    },
  );

  it.each(fridayAllDayVariants)(
    "shows only in the Friday column of a Fri-Sat-Sun 3-day view for %s",
    (_label, event) => {
      const grouped = groupThreeDayAllDayEventsByDay(
        [event],
        saturday,
        timezone,
      );

      expect(grouped[0]!.map((item) => item.id)).toEqual([event.id]);
      expect(grouped[1]!.map((item) => item.id)).toEqual([]);
      expect(grouped[2]!.map((item) => item.id)).toEqual([]);
    },
  );
});

describe("timed multi-day events belong in the all-day row", () => {
  it("treats a timed span across calendar days as an all-day row event", () => {
    const event = createEvent({
      start: "2026-08-26T05:45:00.000Z",
      end: "2026-08-28T06:45:00.000Z",
    });
    const wednesday = new Date(2026, 7, 26);
    const thursday = new Date(2026, 7, 27);

    expect(isMultiDayEvent(event, timezone)).toBe(true);
    expect(
      getTimedTimelineEventsForDay([event], wednesday, timezone, {
        excludeMultiDay: true,
      }),
    ).toEqual([]);
    expect(
      eventOverlapsRange(event, wednesday, thursday, "day", timezone),
    ).toBe(true);
  });
});

describe("timeline overlap without allDay flag", () => {
  it("would incorrectly include UTC-midnight spans on Saturday without allDay semantics", () => {
    const pseudoAllDay = createEvent({
      allDay: false,
      start: "2026-06-19T00:00:00.000Z",
      end: "2026-06-20T00:00:00.000Z",
    });

    expect(
      getTimedTimelineEventsForDay([pseudoAllDay], saturday, timezone).map(
        (event) => event.id,
      ),
    ).toEqual([pseudoAllDay.id]);
  });
});

describe("week-style all-day grouping across Fri-Sat-Sun", () => {
  it("places a Friday all-day event only on Friday when grouping by day", () => {
    const event = createEvent({
      allDay: true,
      start: "2026-06-19T00:00:00.000Z",
      end: "2026-06-20T00:00:00.000Z",
    });

    const days = [friday, saturday, sunday];
    const grouped = days.map((day) =>
      eventOverlapsRange(event, day, day, "day", timezone) ? event.id : null,
    );

    expect(grouped).toEqual([event.id, null, null]);
  });
});
