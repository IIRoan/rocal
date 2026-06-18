import { describe, expect, it } from "@jest/globals";
import { pickerDateToAllDayUtcRange } from "../timezone";
import {
  eventOverlapsCalendarDay,
  formatEventCalendarDate,
  formatPickerDate,
  getEventPickerDateRange,
  getPickerDateRangeDisplay,
  getTimedTimelineEventsForDay,
} from "../event-date";

const timezone = "Europe/Amsterdam";
const friday = new Date(2026, 5, 19);
const saturday = new Date(2026, 5, 13);

describe("formatPickerDate", () => {
  it("formats picker calendar days without timezone conversion", () => {
    expect(formatPickerDate(new Date(2026, 5, 13), "EEEE, MMMM d, yyyy")).toBe(
      "Saturday, June 13, 2026",
    );
  });
});

describe("getPickerDateRangeDisplay", () => {
  it("returns a single label for same-day picker ranges", () => {
    expect(getPickerDateRangeDisplay(friday, friday)).toEqual({
      isSameDay: true,
      label: "Friday, June 19, 2026",
      startLabel: "Fri, Jun 19",
      endLabel: "Fri, Jun 19",
    });
  });

  it("returns separate labels for multi-day picker ranges", () => {
    expect(getPickerDateRangeDisplay(friday, new Date(2026, 5, 21))).toEqual({
      isSameDay: false,
      label: "Friday, June 19, 2026",
      startLabel: "Fri, Jun 19",
      endLabel: "Sun, Jun 21, 2026",
    });
  });

  it("does not shift Saturday to Friday when a UTC timezone option would have", () => {
    expect(
      getPickerDateRangeDisplay(saturday, saturday),
    ).toEqual({
      isSameDay: true,
      label: "Saturday, June 13, 2026",
      startLabel: "Sat, Jun 13",
      endLabel: "Sat, Jun 13",
    });
  });
});

describe("getEventPickerDateRange", () => {
  it("maps timed instants to zoned picker days", () => {
    const { startDate, endDate } = getEventPickerDateRange(
      {
        start: "2026-06-16T22:30:00.000Z",
        end: "2026-06-16T23:30:00.000Z",
        allDay: false,
      },
      timezone,
    );

    expect(startDate).toEqual(new Date(2026, 5, 17));
    expect(endDate).toEqual(new Date(2026, 5, 17));
  });

  it("uses inclusive days for all-day events stored at UTC midnight", () => {
    const { startDate, endDate } = getEventPickerDateRange(
      {
        start: "2026-06-19T00:00:00.000Z",
        end: "2026-06-20T00:00:00.000Z",
        allDay: true,
      },
      timezone,
    );

    expect(startDate).toEqual(friday);
    expect(endDate).toEqual(friday);
  });

  it("uses inclusive days for all-day events from pickerDateToAllDayUtcRange", () => {
    const range = pickerDateToAllDayUtcRange(saturday, saturday, timezone);
    const { startDate, endDate } = getEventPickerDateRange(
      {
        start: range.start,
        end: range.end,
        allDay: true,
      },
      timezone,
    );

    expect(startDate).toEqual(saturday);
    expect(endDate).toEqual(saturday);
  });

  it("spans inclusive picker days for multi-day all-day events", () => {
    const { startDate, endDate } = getEventPickerDateRange(
      {
        start: "2026-06-19T22:00:00.000Z",
        end: "2026-06-22T22:00:00.000Z",
        allDay: true,
      },
      timezone,
    );

    expect(startDate).toEqual(new Date(2026, 5, 20));
    expect(endDate).toEqual(new Date(2026, 5, 22));
  });
});

describe("formatEventCalendarDate", () => {
  it("formats timed events in the configured timezone", () => {
    expect(
      formatEventCalendarDate(
        {
          start: "2026-06-16T10:00:00.000Z",
          end: "2026-06-16T11:00:00.000Z",
          allDay: false,
        },
        timezone,
      ),
    ).toBe("Tuesday, June 16, 2026");
  });

  it("formats all-day events from inclusive calendar days", () => {
    expect(
      formatEventCalendarDate(
        {
          start: "2026-06-19T00:00:00.000Z",
          end: "2026-06-20T00:00:00.000Z",
          allDay: true,
        },
        timezone,
      ),
    ).toBe("Friday, June 19, 2026");
  });

  it("shows Saturday for a Saturday all-day event, not the previous day", () => {
    expect(
      formatEventCalendarDate(
        {
          start: "2026-06-12T22:00:00.000Z",
          end: "2026-06-13T21:59:59.000Z",
          allDay: true,
        },
        timezone,
      ),
    ).toBe("Saturday, June 13, 2026");
  });
});

describe("eventOverlapsCalendarDay", () => {
  const fridayAllDayUtc = {
    start: "2026-06-19T00:00:00.000Z",
    end: "2026-06-20T00:00:00.000Z",
    allDay: true,
  };

  it("includes all-day events only on their inclusive days", () => {
    expect(eventOverlapsCalendarDay(fridayAllDayUtc, friday, timezone)).toBe(
      true,
    );
    expect(
      eventOverlapsCalendarDay(fridayAllDayUtc, new Date(2026, 5, 20), timezone),
    ).toBe(false);
  });

  it("uses timed overlap semantics when allDay is false", () => {
    const pseudoAllDay = {
      start: "2026-06-19T00:00:00.000Z",
      end: "2026-06-20T00:00:00.000Z",
      allDay: false,
    };

    expect(
      eventOverlapsCalendarDay(
        pseudoAllDay,
        new Date(2026, 5, 20),
        timezone,
      ),
    ).toBe(true);
    expect(
      eventOverlapsCalendarDay(fridayAllDayUtc, new Date(2026, 5, 20), timezone),
    ).toBe(false);
  });
});

describe("getTimedTimelineEventsForDay", () => {
  const fridayAllDay = {
    id: "all-day",
    start: "2026-06-19T00:00:00.000Z",
    end: "2026-06-20T00:00:00.000Z",
    allDay: true,
  };

  const saturdayTimed = {
    id: "timed",
    start: "2026-06-13T08:00:00.000Z",
    end: "2026-06-13T09:00:00.000Z",
    allDay: false,
  };

  const overnight = {
    id: "overnight",
    start: "2026-06-16T21:00:00.000Z",
    end: "2026-06-16T23:00:00.000Z",
    allDay: false,
  };

  it("excludes all-day events from the hourly timeline", () => {
    expect(
      getTimedTimelineEventsForDay([fridayAllDay], friday, timezone).map(
        (event) => event.id,
      ),
    ).toEqual([]);
  });

  it("includes timed events that overlap the calendar day", () => {
    expect(
      getTimedTimelineEventsForDay([saturdayTimed], saturday, timezone).map(
        (event) => event.id,
      ),
    ).toEqual(["timed"]);
  });

  it("optionally excludes multi-day timed events", () => {
    expect(
      getTimedTimelineEventsForDay([overnight], new Date(2026, 5, 17), timezone, {
        excludeMultiDay: true,
      }).map((event) => event.id),
    ).toEqual([]);

    expect(
      getTimedTimelineEventsForDay([overnight], new Date(2026, 5, 17), timezone).map(
        (event) => event.id,
      ),
    ).toEqual(["overnight"]);
  });
});

describe("create-to-view round trip", () => {
  it("preserves Saturday when saving and reloading an all-day event", () => {
    const range = pickerDateToAllDayUtcRange(saturday, saturday, timezone);
    const stored = {
      start: range.start,
      end: range.end,
      allDay: true,
    };

    const pickerRange = getEventPickerDateRange(stored, timezone);
    const display = getPickerDateRangeDisplay(
      pickerRange.startDate,
      pickerRange.endDate,
    );

    expect(pickerRange.startDate).toEqual(saturday);
    expect(pickerRange.endDate).toEqual(saturday);
    expect(display).toEqual({
      isSameDay: true,
      label: "Saturday, June 13, 2026",
      startLabel: "Sat, Jun 13",
      endLabel: "Sat, Jun 13",
    });
    expect(formatEventCalendarDate(stored, timezone)).toBe(
      "Saturday, June 13, 2026",
    );
  });
});
