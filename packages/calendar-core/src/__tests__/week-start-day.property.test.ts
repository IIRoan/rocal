import fc from "fast-check";
import { differenceInCalendarDays } from "date-fns";
import { getDefaultCalendarDateRange } from "../date-utils";

/**
 * Property 6: Week start day in calendar grid
 *
 * For any week start day configuration (0 = Sunday, 1 = Monday) and any target
 * date, the first day of the generated week grid SHALL be the configured week
 * start day, and the grid SHALL contain exactly 7 consecutive days.
 *
 * **Validates: Requirements 6.8**
 */

const weekStartDayArb: fc.Arbitrary<0 | 1> = fc.constantFrom(0, 1);

// Generate reasonable dates (2000-01-01 to 2099-12-31) normalized to noon
// to avoid DST boundary issues
const baseDateArb: fc.Arbitrary<Date> = fc
  .date({
    min: new Date(2000, 0, 1),
    max: new Date(2099, 11, 31),
  })
  .map((d) => {
    const normalized = new Date(d);
    normalized.setHours(12, 0, 0, 0);
    return normalized;
  });

describe("getDefaultCalendarDateRange - Week Start Day Properties", () => {
  it("the start date's day of week matches the configured weekStartDay", () => {
    fc.assert(
      fc.property(baseDateArb, weekStartDayArb, (baseDate, weekStartDay) => {
        const { start } = getDefaultCalendarDateRange({
          baseDate,
          view: "week",
          weekStartDay,
        });

        expect(start.getDay()).toBe(weekStartDay);
      }),
    );
  });

  it("the week range covers exactly 7 consecutive days", () => {
    fc.assert(
      fc.property(baseDateArb, weekStartDayArb, (baseDate, weekStartDay) => {
        const { start, end } = getDefaultCalendarDateRange({
          baseDate,
          view: "week",
          weekStartDay,
        });

        // start is at 00:00:00.000 of the first day, end is at 23:59:59.999
        // of the 7th day, so differenceInCalendarDays should be 6
        // (same week, 7 days = indices 0..6)
        const daySpan = differenceInCalendarDays(end, start);
        expect(daySpan).toBe(6);
      }),
    );
  });

  it("the target date falls within the generated week range", () => {
    fc.assert(
      fc.property(baseDateArb, weekStartDayArb, (baseDate, weekStartDay) => {
        const { start, end } = getDefaultCalendarDateRange({
          baseDate,
          view: "week",
          weekStartDay,
        });

        // start <= baseDate <= end
        expect(start.getTime()).toBeLessThanOrEqual(baseDate.getTime());
        expect(baseDate.getTime()).toBeLessThanOrEqual(end.getTime());
      }),
    );
  });
});
