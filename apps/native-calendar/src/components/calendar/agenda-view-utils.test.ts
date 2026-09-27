import type { DecoratedCalendarEvent } from "@workspace/calendar-core";
import { pickerDateToAllDayUtcRange, wallClockToUtc } from "@workspace/calendar-core";
import {
  formatAgendaEventSubtitle,
  formatAgendaEventTime,
  formatAgendaSectionHeader,
} from "./agenda-view-utils";

const TZ = "Europe/Amsterdam";
const DAY = new Date(2026, 2, 12);

function makeEvent(
  overrides: Partial<DecoratedCalendarEvent>,
): DecoratedCalendarEvent {
  return {
    id: "event-1",
    title: "Event",
    start: wallClockToUtc(DAY, 9, 0, TZ),
    end: wallClockToUtc(DAY, 10, 0, TZ),
    calendarId: "cal-1",
    userId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as DecoratedCalendarEvent;
}

describe("formatAgendaEventTime", () => {
  it("labels all-day events", () => {
    const { start, end } = pickerDateToAllDayUtcRange(DAY, DAY, TZ);
    const event = makeEvent({ start, end, allDay: true, timezone: TZ });
    expect(formatAgendaEventTime(event, DAY, "24h", TZ)).toEqual({
      start: "All day",
      end: "",
    });
  });

  it("shows start and end wall-clock times for same-day events", () => {
    expect(formatAgendaEventTime(makeEvent({}), DAY, "24h", TZ)).toEqual({
      start: "09:00",
      end: "10:00",
    });
    expect(formatAgendaEventTime(makeEvent({}), DAY, "12h", TZ)).toEqual({
      start: "9:00 AM",
      end: "10:00 AM",
    });
  });

  it("shows the start time on the first day of a multi-day event", () => {
    const event = makeEvent({
      start: wallClockToUtc(DAY, 14, 0, TZ),
      end: wallClockToUtc(new Date(2026, 2, 14), 17, 0, TZ),
    });
    expect(formatAgendaEventTime(event, DAY, "24h", TZ)).toEqual({
      start: "14:00",
      end: "",
    });
  });

  it("shows the end time on the last day of a multi-day event", () => {
    const lastDay = new Date(2026, 2, 14);
    const event = makeEvent({
      start: wallClockToUtc(DAY, 14, 0, TZ),
      end: wallClockToUtc(lastDay, 17, 0, TZ),
    });
    expect(formatAgendaEventTime(event, lastDay, "24h", TZ)).toEqual({
      start: "All day",
      end: "17:00",
    });
  });

  it("marks middle days of a multi-day event as all day", () => {
    const middleDay = new Date(2026, 2, 13);
    const event = makeEvent({
      start: wallClockToUtc(DAY, 14, 0, TZ),
      end: wallClockToUtc(new Date(2026, 2, 14), 17, 0, TZ),
    });
    expect(formatAgendaEventTime(event, middleDay, "24h", TZ)).toEqual({
      start: "All day",
      end: "",
    });
  });
});

describe("formatAgendaEventSubtitle", () => {
  it("shows the location for single-day events", () => {
    expect(
      formatAgendaEventSubtitle(makeEvent({ location: "Office" }), TZ),
    ).toBe("Office");
    expect(formatAgendaEventSubtitle(makeEvent({ location: "  " }), TZ)).toBeNull();
    expect(formatAgendaEventSubtitle(makeEvent({}), TZ)).toBeNull();
  });

  it("shows the date span for multi-day events", () => {
    const event = makeEvent({
      start: wallClockToUtc(DAY, 14, 0, TZ),
      end: wallClockToUtc(new Date(2026, 2, 14), 17, 0, TZ),
    });
    expect(formatAgendaEventSubtitle(event, TZ)).toBe("Mar 12 – Mar 14");
  });

  it("shows the date span for multi-day all-day events", () => {
    const { start, end } = pickerDateToAllDayUtcRange(
      DAY,
      new Date(2026, 2, 13),
      TZ,
    );
    const event = makeEvent({ start, end, allDay: true, timezone: TZ });
    expect(formatAgendaEventSubtitle(event, TZ)).toBe("Mar 12 – Mar 13");
  });
});

describe("formatAgendaSectionHeader", () => {
  it("splits the day into day, weekday, and month labels", () => {
    expect(formatAgendaSectionHeader(DAY)).toEqual({
      day: "12",
      weekday: "Thu",
      month: "March",
    });
  });
});
