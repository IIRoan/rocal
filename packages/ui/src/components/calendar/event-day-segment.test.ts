import { describe, expect, it } from "@jest/globals";

import type { CalendarEvent } from "./types";
import {
  eventOverlapsRange,
  getEventSegmentForCalendarDay,
  isAllDayRowEvent,
  isMultiDayEvent,
} from "./utils";
import { groupThreeDayAllDayEventsByDay } from "./three-day-view-utils";

const timezone = "Europe/Amsterdam";

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

describe("single-day event membership", () => {
  const saturday = new Date(2026, 5, 20);

  it("treats a single-day all-day event with exclusive end as one day", () => {
    const event = createEvent({
      allDay: true,
      start: "2026-06-19T22:00:00.000Z",
      end: "2026-06-20T22:00:00.000Z",
    });

    expect(isMultiDayEvent(event, timezone)).toBe(false);
    expect(isAllDayRowEvent(event)).toBe(true);
  });

  it("keeps a Saturday timed event on Saturday only", () => {
    const event = createEvent({
      start: "2026-06-20T08:00:00.000Z",
      end: "2026-06-20T09:00:00.000Z",
    });

    expect(isMultiDayEvent(event, timezone)).toBe(false);
    expect(isAllDayRowEvent(event)).toBe(false);
    expect(
      eventOverlapsRange(event, saturday, saturday, "day", timezone),
    ).toBe(true);
    expect(
      eventOverlapsRange(
        event,
        new Date(2026, 5, 19),
        new Date(2026, 5, 19),
        "day",
        timezone,
      ),
    ).toBe(false);
    expect(
      eventOverlapsRange(
        event,
        new Date(2026, 5, 21),
        new Date(2026, 5, 21),
        "day",
        timezone,
      ),
    ).toBe(false);
  });

  it("marks only the Saturday column in a 3-day all-day row", () => {
    const event = createEvent({
      allDay: true,
      start: "2026-06-19T22:00:00.000Z",
      end: "2026-06-20T22:00:00.000Z",
    });
    const grouped = groupThreeDayAllDayEventsByDay(
      [event],
      new Date(2026, 5, 20),
      timezone,
    );

    expect(grouped[0]!.map((item) => item.id)).toEqual([]);
    expect(grouped[1]!.map((item) => item.id)).toEqual([event.id]);
    expect(grouped[2]!.map((item) => item.id)).toEqual([]);
  });

  it("keeps a Friday all-day event off Saturday when stored at UTC midnight", () => {
    const event = createEvent({
      allDay: true,
      start: "2026-06-19T00:00:00.000Z",
      end: "2026-06-20T00:00:00.000Z",
    });
    const friday = new Date(2026, 5, 19);
    const saturday = new Date(2026, 5, 20);

    expect(
      eventOverlapsRange(event, friday, friday, "day", timezone),
    ).toBe(true);
    expect(
      eventOverlapsRange(event, saturday, saturday, "day", timezone),
    ).toBe(false);

    const grouped = groupThreeDayAllDayEventsByDay(
      [event],
      saturday,
      timezone,
    );
    expect(grouped[0]!.map((item) => item.id)).toEqual([event.id]);
    expect(grouped[1]!.map((item) => item.id)).toEqual([]);
  });

  it("uses rounded segment ends for a single-day all-day event", () => {
    const event = createEvent({
      allDay: true,
      start: "2026-06-19T22:00:00.000Z",
      end: "2026-06-20T22:00:00.000Z",
    });

    const friday = new Date(2026, 5, 19);
    const saturday = new Date(2026, 5, 20);
    const sunday = new Date(2026, 5, 21);

    expect(getEventSegmentForCalendarDay(event, friday, timezone)).toEqual({
      isFirstDay: false,
      isLastDay: false,
    });
    expect(getEventSegmentForCalendarDay(event, saturday, timezone)).toEqual({
      isFirstDay: true,
      isLastDay: true,
    });
    expect(getEventSegmentForCalendarDay(event, sunday, timezone)).toEqual({
      isFirstDay: false,
      isLastDay: false,
    });
  });

  it("segments a Friday UTC-midnight all-day event on Friday only", () => {
    const event = createEvent({
      allDay: true,
      start: "2026-06-19T00:00:00.000Z",
      end: "2026-06-20T00:00:00.000Z",
    });
    const friday = new Date(2026, 5, 19);
    const saturday = new Date(2026, 5, 20);

    expect(getEventSegmentForCalendarDay(event, friday, timezone)).toEqual({
      isFirstDay: true,
      isLastDay: true,
    });
    expect(getEventSegmentForCalendarDay(event, saturday, timezone)).toEqual({
      isFirstDay: false,
      isLastDay: false,
    });
  });

  it("does not put timed single-day events in the all-day grouping", () => {
    const event = createEvent({
      start: "2026-06-20T08:00:00.000Z",
      end: "2026-06-20T09:00:00.000Z",
    });
    const grouped = groupThreeDayAllDayEventsByDay(
      [event],
      new Date(2026, 5, 20),
      timezone,
    );

    expect(grouped).toEqual([[], [], []]);
  });
});

describe("multi-day event membership", () => {
  it("detects a true multi-day all-day event", () => {
    const event = createEvent({
      allDay: true,
      start: "2026-06-19T22:00:00.000Z",
      end: "2026-06-22T22:00:00.000Z",
    });

    expect(isMultiDayEvent(event, timezone)).toBe(true);
  });

  it("segments a multi-day all-day event across its inclusive days only", () => {
    const event = createEvent({
      allDay: true,
      start: "2026-06-19T22:00:00.000Z",
      end: "2026-06-22T22:00:00.000Z",
    });

    const friday = new Date(2026, 5, 19);
    const saturday = new Date(2026, 5, 20);
    const sunday = new Date(2026, 5, 21);
    const monday = new Date(2026, 5, 22);
    const tuesday = new Date(2026, 5, 23);

    expect(getEventSegmentForCalendarDay(event, friday, timezone)).toEqual({
      isFirstDay: false,
      isLastDay: false,
    });
    expect(getEventSegmentForCalendarDay(event, saturday, timezone)).toEqual({
      isFirstDay: true,
      isLastDay: false,
    });
    expect(getEventSegmentForCalendarDay(event, sunday, timezone)).toEqual({
      isFirstDay: false,
      isLastDay: false,
    });
    expect(getEventSegmentForCalendarDay(event, monday, timezone)).toEqual({
      isFirstDay: false,
      isLastDay: true,
    });
    expect(getEventSegmentForCalendarDay(event, tuesday, timezone)).toEqual({
      isFirstDay: false,
      isLastDay: false,
    });
  });

  it("detects timed overnight events as multi-day without all-day row eligibility", () => {
    const event = createEvent({
      start: "2026-06-19T21:00:00.000Z",
      end: "2026-06-19T23:00:00.000Z",
    });

    expect(isMultiDayEvent(event, timezone)).toBe(true);
    expect(isAllDayRowEvent(event)).toBe(false);
  });
});
