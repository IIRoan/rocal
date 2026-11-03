import { describe, expect, it } from "@jest/globals";
import { formatCalendarDayKey, wallClockToUtc } from "@workspace/calendar-core";

import {
  getThreeDayCalendarDays,
  getThreeDayTimelineScrollTop,
} from "./three-day-view-utils";
import { WeekCellsHeight } from "./constants";

describe("getThreeDayCalendarDays", () => {
  // Zones far from any test machine's zone, so browser-local days would land on the wrong day.
  const zones = ["Pacific/Pago_Pago", "UTC", "Europe/Amsterdam", "Pacific/Kiritimati"];

  it.each(zones)(
    "centers the account-zone day at either end of the day in %s",
    (timezone) => {
      for (const hour of [0, 23]) {
        const currentDate = wallClockToUtc(new Date(2026, 10, 2), hour, 30, timezone);

        expect(
          getThreeDayCalendarDays(currentDate, timezone).map(formatCalendarDayKey),
        ).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
      }
    },
  );
});

describe("getThreeDayTimelineScrollTop", () => {
  const days = getThreeDayCalendarDays(
    new Date("2026-06-16T12:00:00.000Z"),
    "Europe/Amsterdam",
  );

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
