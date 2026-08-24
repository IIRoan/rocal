import { describe, expect, it } from "@jest/globals";

import { layoutAllDayRowEvents } from "./all-day-layout";
import type { CalendarEvent } from "./types";

const timezone = "Europe/Amsterdam";
const week = [
  new Date(2026, 7, 24),
  new Date(2026, 7, 25),
  new Date(2026, 7, 26),
  new Date(2026, 7, 27),
  new Date(2026, 7, 28),
  new Date(2026, 7, 29),
  new Date(2026, 7, 30),
];

function createEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-1",
    title: "Event",
    start: "2026-08-26T05:45:00.000Z",
    end: "2026-08-26T06:45:00.000Z",
    allDay: false,
    color: "blue",
    ...overrides,
  };
}

describe("layoutAllDayRowEvents", () => {
  it("places a timed multi-day event as one card spanning its visible days", () => {
    const event = createEvent({
      id: "multiday",
      title: "multiday",
      start: "2026-08-26T05:45:00.000Z",
      end: "2026-08-28T06:45:00.000Z",
    });

    const { placements, laneCount } = layoutAllDayRowEvents(
      [event],
      week,
      timezone,
    );

    expect(laneCount).toBe(1);
    expect(placements).toEqual([
      {
        event,
        startIndex: 2,
        span: 3,
        lane: 0,
        continuesBefore: false,
        continuesAfter: false,
      },
    ]);
  });

  it("keeps single-day timed events out of the all-day row", () => {
    const event = createEvent({
      start: "2026-08-26T07:00:00.000Z",
      end: "2026-08-26T08:00:00.000Z",
    });

    expect(layoutAllDayRowEvents([event], week, timezone)).toEqual({
      placements: [],
      laneCount: 0,
    });
  });

  it("clips events that start before the visible range and keeps the title visible", () => {
    const event = createEvent({
      id: "trip",
      allDay: true,
      start: "2026-08-20T00:00:00.000Z",
      end: "2026-08-27T00:00:00.000Z",
    });

    const { placements } = layoutAllDayRowEvents([event], week, timezone);

    expect(placements).toEqual([
      {
        event,
        startIndex: 0,
        span: 3,
        lane: 0,
        continuesBefore: true,
        continuesAfter: false,
      },
    ]);
  });

  it("clips events that continue after the visible range", () => {
    const event = createEvent({
      id: "trip",
      allDay: true,
      start: "2026-08-29T00:00:00.000Z",
      end: "2026-09-04T00:00:00.000Z",
    });

    const { placements } = layoutAllDayRowEvents([event], week, timezone);

    expect(placements).toEqual([
      {
        event,
        startIndex: 5,
        span: 2,
        lane: 0,
        continuesBefore: false,
        continuesAfter: true,
      },
    ]);
  });

  it("packs overlapping spans into separate lanes without splitting cards", () => {
    const longEvent = createEvent({
      id: "long",
      allDay: true,
      start: "2026-08-24T00:00:00.000Z",
      end: "2026-08-28T00:00:00.000Z",
    });
    const nestedEvent = createEvent({
      id: "nested",
      allDay: true,
      start: "2026-08-25T00:00:00.000Z",
      end: "2026-08-26T00:00:00.000Z",
    });

    const { placements, laneCount } = layoutAllDayRowEvents(
      [nestedEvent, longEvent],
      week,
      timezone,
    );

    expect(laneCount).toBe(2);
    expect(placements.find((item) => item.event.id === "long")).toMatchObject({
      startIndex: 0,
      span: 4,
      lane: 0,
    });
    expect(placements.find((item) => item.event.id === "nested")).toMatchObject({
      startIndex: 1,
      span: 1,
      lane: 1,
    });
  });

  it("reuses a lane when spans do not overlap", () => {
    const monday = createEvent({
      id: "monday",
      allDay: true,
      start: "2026-08-24T00:00:00.000Z",
      end: "2026-08-25T00:00:00.000Z",
    });
    const friday = createEvent({
      id: "friday",
      allDay: true,
      start: "2026-08-28T00:00:00.000Z",
      end: "2026-08-29T00:00:00.000Z",
    });

    const { placements, laneCount } = layoutAllDayRowEvents(
      [monday, friday],
      week,
      timezone,
    );

    expect(laneCount).toBe(1);
    expect(placements.map((item) => item.lane)).toEqual([0, 0]);
  });

  it("does not leak a Friday all-day event into Saturday", () => {
    const event = createEvent({
      id: "friday-all-day",
      allDay: true,
      start: "2026-08-28T00:00:00.000Z",
      end: "2026-08-29T00:00:00.000Z",
    });

    const { placements } = layoutAllDayRowEvents([event], week, timezone);

    expect(placements).toEqual([
      {
        event,
        startIndex: 4,
        span: 1,
        lane: 0,
        continuesBefore: false,
        continuesAfter: false,
      },
    ]);
  });
});
