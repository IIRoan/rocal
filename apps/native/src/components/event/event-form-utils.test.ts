import { describe, expect, it } from "@jest/globals";

import {
  buildEventRequest,
  parseCreateEventCalendarDay,
  pickerISOStringToUtc,
  setPickerDatePart,
  setPickerTimePart,
  toTimezonePickerISOString,
} from "./event-form-utils";

describe("event-form timezone helpers", () => {
  const timezone = "Europe/Amsterdam";

  it("parses YYYY-MM-DD route params as picker calendar days", () => {
    const parsed = parseCreateEventCalendarDay("2026-06-16", timezone);

    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(5);
    expect(parsed?.getDate()).toBe(16);
  });

  it("uses the date portion of ISO route params as the picker calendar day", () => {
    const parsed = parseCreateEventCalendarDay(
      "2026-06-16T22:30:00.000Z",
      timezone,
    );

    expect(parsed?.getDate()).toBe(16);
  });

  it("maps non day-key instants to picker calendar days", () => {
    const parsed = parseCreateEventCalendarDay(
      "Wed Jun 17 2026 00:30:00 GMT+0200",
      timezone,
    );

    expect(parsed?.getDate()).toBe(17);
  });

  it("converts picker ISO strings to UTC using the configured timezone", () => {
    const utc = pickerISOStringToUtc("2026-06-16T14:15", timezone);

    expect(utc.toISOString()).toBe("2026-06-16T12:15:00.000Z");
  });

  it("formats UTC instants for picker inputs in the configured timezone", () => {
    const formatted = toTimezonePickerISOString(
      new Date("2026-06-16T22:30:00.000Z"),
      timezone,
    );

    expect(formatted).toBe("2026-06-17T00:30");
  });

  it("builds timed event requests with timezone-aware UTC instants", () => {
    const request = buildEventRequest({
      title: "Planning",
      start: "2026-06-16T09:30",
      end: "2026-06-16T10:30",
      calendarId: "calendar-1",
      allDay: false,
      location: "",
      description: "",
      timezone,
    });

    expect(request.timezone).toBe(timezone);
    expect(request.start).toBe("2026-06-16T07:30:00.000Z");
    expect(request.end).toBe("2026-06-16T08:30:00.000Z");
  });

  it("builds all-day event requests spanning inclusive picker days", () => {
    const request = buildEventRequest({
      title: "Retreat",
      start: "2026-06-16T00:00",
      end: "2026-06-17T00:00",
      calendarId: "calendar-1",
      allDay: true,
      location: "",
      description: "",
      timezone,
    });

    expect(request.allDay).toBe(true);
    expect(request.start).toBe("2026-06-15T22:00:00.000Z");
    expect(request.end).toBe("2026-06-17T21:59:59.000Z");
  });

  it("defaults to Amsterdam when building requests without an explicit timezone", () => {
    const request = buildEventRequest({
      title: "Standup",
      start: "2026-06-16T09:00",
      end: "2026-06-16T09:30",
      calendarId: "calendar-1",
      allDay: false,
      location: "",
      description: "",
    });

    expect(request.timezone).toBe("Europe/Amsterdam");
    expect(request.start).toBe("2026-06-16T07:00:00.000Z");
  });

  it("keeps the wall-clock time when only the picker date changes", () => {
    const updated = setPickerDatePart(
      "2026-06-16T14:15",
      new Date(2026, 5, 20),
      timezone,
    );

    expect(updated).toBe("2026-06-20T14:15");
    expect(pickerISOStringToUtc(updated, timezone).toISOString()).toBe(
      "2026-06-20T12:15:00.000Z",
    );
  });

  it("updates only the time portion of a picker value", () => {
    expect(setPickerTimePart("2026-06-16T09:00", new Date(2026, 0, 1, 16, 45))).toBe(
      "2026-06-16T16:45",
    );
  });

  it("round-trips edited events through picker strings without shifting wall clock", () => {
    const originalUtc = new Date("2026-06-16T12:15:00.000Z");
    const pickerValue = toTimezonePickerISOString(originalUtc, timezone);
    const roundTrippedUtc = pickerISOStringToUtc(pickerValue, timezone);

    expect(pickerValue).toBe("2026-06-16T14:15");
    expect(roundTrippedUtc.toISOString()).toBe(originalUtc.toISOString());
  });
});
