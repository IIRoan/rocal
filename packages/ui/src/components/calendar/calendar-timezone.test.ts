import { describe, expect, it } from "@jest/globals";

import type { CalendarEvent } from "./types";
import {
  getAgendaEventsForDay,
  getAllEventsForDay,
  getEventsForDay,
  getSpanningEventsForDay,
  isMultiDayEvent,
  sortEvents,
} from "./utils";
import { getInclusiveCalendarDayRange } from "@workspace/calendar-core";

function createEvent(
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  return {
    id: "event-1",
    title: "Timezone event",
    start: "2026-06-16T10:00:00.000Z",
    end: "2026-06-16T11:00:00.000Z",
    allDay: false,
    color: "blue",
    ...overrides,
  };
}

describe("inclusive calendar day range", () => {
  const timezone = "Europe/Amsterdam";

  it("treats exclusive all-day end instants as the previous inclusive day", () => {
    const { firstDay, lastDay } = getInclusiveCalendarDayRange(
      new Date("2026-06-19T22:00:00.000Z"),
      new Date("2026-06-20T22:00:00.000Z"),
      timezone,
      { allDay: true },
    );

    expect(firstDay).toEqual(new Date(2026, 5, 20));
    expect(lastDay).toEqual(new Date(2026, 5, 20));
  });
});

describe("calendar timezone helpers", () => {
  const timezone = "Europe/Amsterdam";
  const calendarDay = new Date(2026, 5, 17);

  it("treats events crossing local midnight as multi-day", () => {
    const event = createEvent({
      start: "2026-06-16T21:00:00.000Z",
      end: "2026-06-16T23:00:00.000Z",
    });

    expect(isMultiDayEvent(event, timezone)).toBe(true);
  });

  it("keeps same-day timed events as single-day", () => {
    const event = createEvent({
      start: "2026-06-16T10:00:00.000Z",
      end: "2026-06-16T11:00:00.000Z",
    });

    expect(isMultiDayEvent(event, timezone)).toBe(false);
  });

  it("filters events that start on the zoned calendar day", () => {
    const events = [
      createEvent({
        id: "starts-on-day",
        start: "2026-06-16T22:30:00.000Z",
        end: "2026-06-16T23:30:00.000Z",
      }),
      createEvent({
        id: "previous-day",
        start: "2026-06-16T10:00:00.000Z",
        end: "2026-06-16T11:00:00.000Z",
      }),
    ];

    expect(getEventsForDay(events, calendarDay, timezone).map((e) => e.id)).toEqual(
      ["starts-on-day"],
    );
  });

  it("includes spanning and overnight events for a zoned day", () => {
    const events = [
      createEvent({
        id: "overnight",
        start: "2026-06-16T22:30:00.000Z",
        end: "2026-06-17T01:30:00.000Z",
      }),
      createEvent({
        id: "other-day",
        start: "2026-06-15T10:00:00.000Z",
        end: "2026-06-15T11:00:00.000Z",
      }),
    ];

    expect(getAllEventsForDay(events, calendarDay, timezone).map((e) => e.id)).toEqual(
      ["overnight"],
    );
    expect(getAgendaEventsForDay(events, calendarDay, timezone).map((e) => e.id)).toEqual(
      ["overnight"],
    );
  });

  it("treats explicit multi-day all-day events as multi-day", () => {
    const event = createEvent({
      start: "2026-06-15T22:00:00.000Z",
      end: "2026-06-17T22:00:00.000Z",
      allDay: true,
    });

    expect(isMultiDayEvent(event, timezone)).toBe(true);
  });

  it("keeps a single-day all-day event as single-day", () => {
    const event = createEvent({
      start: "2026-06-19T22:00:00.000Z",
      end: "2026-06-20T22:00:00.000Z",
      allDay: true,
    });

    expect(isMultiDayEvent(event, timezone)).toBe(false);
  });

  it("lists spanning events that continue from a previous zoned day", () => {
    const events = [
      createEvent({
        id: "spanning",
        start: "2026-06-15T10:00:00.000Z",
        end: "2026-06-18T10:00:00.000Z",
      }),
      createEvent({
        id: "starts-today",
        start: "2026-06-16T22:30:00.000Z",
        end: "2026-06-16T23:30:00.000Z",
      }),
    ];

    expect(
      getSpanningEventsForDay(events, calendarDay, timezone).map((e) => e.id),
    ).toEqual(["spanning"]);
  });

  it("sorts multi-day events ahead of single-day events in the zoned day column", () => {
    const events = [
      createEvent({
        id: "timed",
        start: "2026-06-16T10:00:00.000Z",
        end: "2026-06-16T11:00:00.000Z",
      }),
      createEvent({
        id: "multi",
        start: "2026-06-15T10:00:00.000Z",
        end: "2026-06-18T10:00:00.000Z",
      }),
    ];

    expect(sortEvents(events, timezone).map((e) => e.id)).toEqual([
      "multi",
      "timed",
    ]);
  });
});
