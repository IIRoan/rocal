import fc from "fast-check";
import { getDefaultCalendarDateRange } from "../date-utils";
import type { CalendarView } from "../types";

/**
 * Property 3: Calendar date range validity
 *
 * For any valid base date, view type, and week start day,
 * `getDefaultCalendarDateRange` returns `start <= end`
 * with the base date within `[start, end]`.
 *
 * **Validates: Requirements 4.4**
 */

const calendarViewArb: fc.Arbitrary<CalendarView> = fc.constantFrom(
  "month",
  "week",
  "3day",
  "day",
  "agenda",
);

const weekStartDayArb: fc.Arbitrary<0 | 1> = fc.constantFrom(0, 1);

// Generate reasonable dates (2000-01-01 to 2099-12-31) to avoid edge cases
// with extreme dates that aren't realistic calendar usage
const baseDateArb: fc.Arbitrary<Date> = fc
  .date({
    min: new Date(2000, 0, 1),
    max: new Date(2099, 11, 31),
  })
  .map((d) => {
    // Normalize to noon to avoid DST boundary issues
    const normalized = new Date(d);
    normalized.setHours(12, 0, 0, 0);
    return normalized;
  });

describe("getDefaultCalendarDateRange - Property Tests", () => {
  it("should always return start <= end for any valid inputs", () => {
    fc.assert(
      fc.property(
        baseDateArb,
        calendarViewArb,
        weekStartDayArb,
        (baseDate, view, weekStartDay) => {
          const { start, end } = getDefaultCalendarDateRange({
            baseDate,
            view,
            weekStartDay,
          });

          expect(start.getTime()).toBeLessThanOrEqual(end.getTime());
        },
      ),
    );
  });

  it("should always contain the base date within [start, end]", () => {
    fc.assert(
      fc.property(
        baseDateArb,
        calendarViewArb,
        weekStartDayArb,
        (baseDate, view, weekStartDay) => {
          const { start, end } = getDefaultCalendarDateRange({
            baseDate,
            view,
            weekStartDay,
          });

          // start <= baseDate
          expect(start.getTime()).toBeLessThanOrEqual(baseDate.getTime());
          // baseDate <= end
          expect(baseDate.getTime()).toBeLessThanOrEqual(end.getTime());
        },
      ),
    );
  });

  it("should be deterministic: same inputs always produce same outputs", () => {
    fc.assert(
      fc.property(
        baseDateArb,
        calendarViewArb,
        weekStartDayArb,
        (baseDate, view, weekStartDay) => {
          const result1 = getDefaultCalendarDateRange({
            baseDate,
            view,
            weekStartDay,
          });
          const result2 = getDefaultCalendarDateRange({
            baseDate,
            view,
            weekStartDay,
          });

          expect(result1.start.getTime()).toBe(result2.start.getTime());
          expect(result1.end.getTime()).toBe(result2.end.getTime());
        },
      ),
    );
  });
});
