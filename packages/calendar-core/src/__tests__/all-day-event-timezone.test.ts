import { describe, expect, it } from "@jest/globals";

import {
  eventOverlapsCalendarDay,
  eventSpansMultipleCalendarDays,
  formatEventCalendarDate,
  formatEventSpanLabel,
  getEventCalendarDayRange,
  getEventPickerDateRange,
  moveAllDayEventToDay,
} from "../event-date";
import {
  DEFAULT_CALENDAR_TIMEZONE,
  formatCalendarDayKey,
  pickerDateToAllDayUtcRange,
} from "../timezone";

const TIMEZONES = [
  "Europe/Amsterdam",
  "Europe/London",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Pacific/Pago_Pago",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Australia/Lord_Howe",
  "Pacific/Kiritimati",
] as const;

function createAllDayEvent(
  firstDay: Date,
  lastDay: Date,
  timezone: string | null | undefined,
) {
  const { start, end } = pickerDateToAllDayUtcRange(firstDay, lastDay, timezone);
  return { start, end, allDay: true, timezone };
}

function dayKeys(range: { firstDay: Date; lastDay: Date }) {
  return [formatCalendarDayKey(range.firstDay), formatCalendarDayKey(range.lastDay)];
}

describe("all-day events across timezones", () => {
  describe("single-day events stay on one day", () => {
    const day = new Date(2026, 8, 22);

    for (const savedIn of TIMEZONES) {
      for (const viewedIn of TIMEZONES) {
        it(`saved in ${savedIn}, viewed in ${viewedIn}`, () => {
          const event = createAllDayEvent(day, day, savedIn);

          expect(dayKeys(getEventCalendarDayRange(event, viewedIn))).toEqual([
            "2026-09-22",
            "2026-09-22",
          ]);
          expect(eventSpansMultipleCalendarDays(event, viewedIn)).toBe(false);
        });
      }
    }
  });

  describe("multi-day events keep their exact span", () => {
    for (const savedIn of TIMEZONES) {
      for (const viewedIn of ["UTC", "America/Los_Angeles", "Pacific/Kiritimati"]) {
        it(`saved in ${savedIn}, viewed in ${viewedIn}`, () => {
          const event = createAllDayEvent(
            new Date(2026, 11, 30),
            new Date(2027, 0, 1),
            savedIn,
          );

          expect(dayKeys(getEventCalendarDayRange(event, viewedIn))).toEqual([
            "2026-12-30",
            "2027-01-01",
          ]);
        });
      }
    }
  });

  describe("daylight saving transitions", () => {
    const transitions: Array<[string, Date]> = [
      ["Europe/Amsterdam", new Date(2026, 2, 29)],
      ["Europe/Amsterdam", new Date(2026, 9, 25)],
      ["America/New_York", new Date(2026, 2, 8)],
      ["America/New_York", new Date(2026, 10, 1)],
      ["Australia/Lord_Howe", new Date(2026, 3, 5)],
      ["Australia/Lord_Howe", new Date(2026, 9, 4)],
    ];

    for (const [timezone, day] of transitions) {
      const key = formatCalendarDayKey(day);

      it(`keeps a single day on ${key} in ${timezone}`, () => {
        const event = createAllDayEvent(day, day, timezone);

        for (const viewedIn of TIMEZONES) {
          expect(dayKeys(getEventCalendarDayRange(event, viewedIn))).toEqual([
            key,
            key,
          ]);
        }
      });

      it(`covers the day before and after ${key} in ${timezone}`, () => {
        const before = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1);
        const after = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
        const event = createAllDayEvent(before, after, timezone);

        expect(dayKeys(getEventCalendarDayRange(event, timezone))).toEqual([
          formatCalendarDayKey(before),
          formatCalendarDayKey(after),
        ]);
      });
    }
  });

  describe("UTC date encodings", () => {
    const encodings = [
      ["exclusive UTC midnight end", "2026-09-23T00:00:00.000Z"],
      ["inclusive 23:59:59Z end", "2026-09-22T23:59:59.000Z"],
      ["inclusive 23:59:59.999Z end", "2026-09-22T23:59:59.999Z"],
    ] as const;

    for (const [label, end] of encodings) {
      for (const eventTimezone of ["Europe/Amsterdam", "America/New_York", null]) {
        it(`reads ${label} as one day when the event timezone is ${eventTimezone}`, () => {
          const event = {
            start: new Date("2026-09-22T00:00:00.000Z"),
            end: new Date(end),
            allDay: true,
            timezone: eventTimezone,
          };

          for (const viewedIn of TIMEZONES) {
            expect(dayKeys(getEventCalendarDayRange(event, viewedIn))).toEqual([
              "2026-09-22",
              "2026-09-22",
            ]);
          }
        });
      }
    }

    it("reads a multi-day exclusive UTC range without its end day", () => {
      const event = {
        start: new Date("2026-09-22T00:00:00.000Z"),
        end: new Date("2026-09-25T00:00:00.000Z"),
        allDay: true,
        timezone: "Asia/Tokyo",
      };

      expect(dayKeys(getEventCalendarDayRange(event, "America/Los_Angeles"))).toEqual([
        "2026-09-22",
        "2026-09-24",
      ]);
    });
  });

  it("falls back to the viewer timezone for events without a saved timezone", () => {
    const event = createAllDayEvent(
      new Date(2026, 8, 22),
      new Date(2026, 8, 22),
      "America/New_York",
    );

    expect(
      dayKeys(getEventCalendarDayRange({ ...event, timezone: undefined }, "America/New_York")),
    ).toEqual(["2026-09-22", "2026-09-22"]);
    expect(
      dayKeys(getEventCalendarDayRange({ ...event, timezone: "  " }, "America/New_York")),
    ).toEqual(["2026-09-22", "2026-09-22"]);
  });

  it("encodes missing timezones in the default calendar timezone instead of UTC", () => {
    const day = new Date(2026, 8, 22);
    const withoutTimezone = pickerDateToAllDayUtcRange(day, day, undefined);
    const withDefault = pickerDateToAllDayUtcRange(day, day, DEFAULT_CALENDAR_TIMEZONE);

    expect(withoutTimezone).toEqual(withDefault);
    expect(pickerDateToAllDayUtcRange(day, day, "")).toEqual(withDefault);
    expect(withoutTimezone.start.toISOString()).toBe("2026-09-21T22:00:00.000Z");
    expect(withoutTimezone.end.toISOString()).toBe("2026-09-22T21:59:59.000Z");
  });

  describe("day membership", () => {
    it("matches only the saved day when the viewer is in another timezone", () => {
      const event = createAllDayEvent(
        new Date(2026, 8, 22),
        new Date(2026, 8, 22),
        "Europe/Amsterdam",
      );

      for (const viewedIn of ["America/New_York", "Asia/Tokyo", "UTC"]) {
        expect(eventOverlapsCalendarDay(event, new Date(2026, 8, 21), viewedIn)).toBe(false);
        expect(eventOverlapsCalendarDay(event, new Date(2026, 8, 22), viewedIn)).toBe(true);
        expect(eventOverlapsCalendarDay(event, new Date(2026, 8, 23), viewedIn)).toBe(false);
      }
    });

    it("still uses the viewer timezone for timed events", () => {
      const event = {
        start: new Date("2026-09-22T22:30:00.000Z"),
        end: new Date("2026-09-22T23:30:00.000Z"),
        allDay: false,
        timezone: "Europe/Amsterdam",
      };

      expect(eventOverlapsCalendarDay(event, new Date(2026, 8, 22), "America/New_York")).toBe(
        true,
      );
      expect(eventOverlapsCalendarDay(event, new Date(2026, 8, 23), "Europe/Amsterdam")).toBe(
        true,
      );
      expect(eventSpansMultipleCalendarDays(event, "Europe/Amsterdam")).toBe(false);
    });
  });

  describe("labels and editor dates", () => {
    const event = createAllDayEvent(
      new Date(2026, 8, 22),
      new Date(2026, 8, 24),
      "Asia/Tokyo",
    );

    it("shows the saved dates in the editor for any viewer timezone", () => {
      const { startDate, endDate } = getEventPickerDateRange(event, "America/Los_Angeles");

      expect(formatCalendarDayKey(startDate)).toBe("2026-09-22");
      expect(formatCalendarDayKey(endDate)).toBe("2026-09-24");
    });

    it("formats span and date labels from the saved dates", () => {
      expect(formatEventSpanLabel(event, "America/Los_Angeles")).toBe("Sep 22 – Sep 24");
      expect(formatEventCalendarDate(event, "America/Los_Angeles", "yyyy-MM-dd")).toBe(
        "2026-09-22",
      );
    });

    it("round-trips through the editor into the viewer timezone unchanged", () => {
      const { startDate, endDate } = getEventPickerDateRange(event, "America/Los_Angeles");
      const resaved = createAllDayEvent(startDate, endDate, "America/Los_Angeles");

      expect(dayKeys(getEventCalendarDayRange(resaved, "Asia/Tokyo"))).toEqual([
        "2026-09-22",
        "2026-09-24",
      ]);
    });
  });

  describe("moveAllDayEventToDay", () => {
    it("moves an event saved elsewhere to the target day in the viewer timezone", () => {
      const event = createAllDayEvent(
        new Date(2026, 8, 22),
        new Date(2026, 8, 22),
        "Europe/Amsterdam",
      );

      const moved = moveAllDayEventToDay(event, new Date(2026, 8, 25), "America/New_York");

      expect(moved).toEqual(
        pickerDateToAllDayUtcRange(
          new Date(2026, 8, 25),
          new Date(2026, 8, 25),
          "America/New_York",
        ),
      );
      expect(
        dayKeys(
          getEventCalendarDayRange(
            { ...moved, allDay: true, timezone: "America/New_York" },
            "Europe/Amsterdam",
          ),
        ),
      ).toEqual(["2026-09-25", "2026-09-25"]);
    });

    it("keeps the day count when moving across a DST change", () => {
      const event = createAllDayEvent(
        new Date(2026, 9, 20),
        new Date(2026, 9, 22),
        "Europe/Amsterdam",
      );

      const moved = moveAllDayEventToDay(event, new Date(2026, 9, 24), "Europe/Amsterdam");

      expect(
        dayKeys(
          getEventCalendarDayRange(
            { ...moved, allDay: true, timezone: "Europe/Amsterdam" },
            "Europe/Amsterdam",
          ),
        ),
      ).toEqual(["2026-10-24", "2026-10-26"]);
    });
  });
});
