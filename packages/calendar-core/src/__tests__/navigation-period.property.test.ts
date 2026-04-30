import fc from "fast-check";
import {
  addMonths,
  addWeeks,
  addDays,
  subMonths,
  subWeeks,
  subDays,
  differenceInCalendarDays,
} from "date-fns";
import { getDefaultCalendarDateRange } from "../date-utils";
import { AgendaDaysToShow, type CalendarView } from "../types";

/**
 * Property 5: Calendar view navigation period
 *
 * For any current date and calendar view type, swiping forward SHALL advance
 * the date by exactly one period (1 month for month view, 1 week for week view,
 * 1 day for day view, 3 days for three-day view, the configured agenda days for
 * agenda view), and swiping backward SHALL subtract the same period. The resulting
 * date SHALL be deterministic given the same inputs.
 *
 * **Validates: Requirements 6.6**
 */

const calendarViewArb: fc.Arbitrary<CalendarView> = fc.constantFrom(
  "month",
  "week",
  "3day",
  "day",
  "agenda",
);

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

/**
 * Advance a base date by one navigation period for the given view type.
 */
function advanceByOnePeriod(baseDate: Date, view: CalendarView): Date {
  switch (view) {
    case "month":
      return addMonths(baseDate, 1);
    case "week":
      return addWeeks(baseDate, 1);
    case "day":
      return addDays(baseDate, 1);
    case "3day":
      return addDays(baseDate, 3);
    case "agenda":
      return addDays(baseDate, AgendaDaysToShow);
  }
}

/**
 * Subtract one navigation period from a base date for the given view type.
 */
function subtractByOnePeriod(baseDate: Date, view: CalendarView): Date {
  switch (view) {
    case "month":
      return subMonths(baseDate, 1);
    case "week":
      return subWeeks(baseDate, 1);
    case "day":
      return subDays(baseDate, 1);
    case "3day":
      return subDays(baseDate, 3);
    case "agenda":
      return subDays(baseDate, AgendaDaysToShow);
  }
}

describe("getDefaultCalendarDateRange - Navigation Period Properties", () => {
  it("navigating forward then backward returns to the same date range (round-trip)", () => {
    fc.assert(
      fc.property(
        baseDateArb,
        calendarViewArb,
        weekStartDayArb,
        (baseDate, view, weekStartDay) => {
          const originalRange = getDefaultCalendarDateRange({
            baseDate,
            view,
            weekStartDay,
          });

          // Navigate forward by one period
          const forwardDate = advanceByOnePeriod(baseDate, view);
          // Navigate backward from the forward date
          const roundTripDate = subtractByOnePeriod(forwardDate, view);

          const roundTripRange = getDefaultCalendarDateRange({
            baseDate: roundTripDate,
            view,
            weekStartDay,
          });

          expect(roundTripRange.start.getTime()).toBe(
            originalRange.start.getTime(),
          );
          expect(roundTripRange.end.getTime()).toBe(
            originalRange.end.getTime(),
          );
        },
      ),
    );
  });

  it("navigating forward advances the start date by exactly one period", () => {
    fc.assert(
      fc.property(
        baseDateArb,
        calendarViewArb,
        weekStartDayArb,
        (baseDate, view, weekStartDay) => {
          const originalRange = getDefaultCalendarDateRange({
            baseDate,
            view,
            weekStartDay,
          });

          const advancedDate = advanceByOnePeriod(baseDate, view);
          const advancedRange = getDefaultCalendarDateRange({
            baseDate: advancedDate,
            view,
            weekStartDay,
          });

          // Use calendar day difference to avoid DST-related millisecond drift
          const daysDiff = differenceInCalendarDays(
            advancedRange.start,
            originalRange.start,
          );

          switch (view) {
            case "month": {
              // Month view: the start is snapped to the start of the week
              // containing the first of the month. Advancing by 1 month should
              // move the range to cover the next month.
              const originalMonthStart = new Date(
                baseDate.getFullYear(),
                baseDate.getMonth(),
                1,
                12,
                0,
                0,
                0,
              );
              const advancedMonthStart = addMonths(originalMonthStart, 1);

              // The advanced range start should be <= the first of the next month
              expect(advancedRange.start.getTime()).toBeLessThanOrEqual(
                advancedMonthStart.getTime(),
              );
              // And the advanced range end should be >= the last day of the next month
              const advancedMonthEnd = new Date(
                advancedMonthStart.getFullYear(),
                advancedMonthStart.getMonth() + 1,
                0,
                12,
                0,
                0,
                0,
              );
              expect(advancedRange.end.getTime()).toBeGreaterThanOrEqual(
                advancedMonthEnd.getTime(),
              );
              break;
            }
            case "week": {
              expect(daysDiff).toBe(7);
              break;
            }
            case "day": {
              expect(daysDiff).toBe(1);
              break;
            }
            case "3day": {
              expect(daysDiff).toBe(3);
              break;
            }
            case "agenda": {
              expect(daysDiff).toBe(AgendaDaysToShow);
              break;
            }
          }
        },
      ),
    );
  });

  it("navigation is deterministic: same inputs always produce same outputs", () => {
    fc.assert(
      fc.property(
        baseDateArb,
        calendarViewArb,
        weekStartDayArb,
        (baseDate, view, weekStartDay) => {
          // Compute forward navigation twice
          const forwardDate1 = advanceByOnePeriod(baseDate, view);
          const range1 = getDefaultCalendarDateRange({
            baseDate: forwardDate1,
            view,
            weekStartDay,
          });

          const forwardDate2 = advanceByOnePeriod(baseDate, view);
          const range2 = getDefaultCalendarDateRange({
            baseDate: forwardDate2,
            view,
            weekStartDay,
          });

          expect(range1.start.getTime()).toBe(range2.start.getTime());
          expect(range1.end.getTime()).toBe(range2.end.getTime());

          // Compute backward navigation twice
          const backwardDate1 = subtractByOnePeriod(baseDate, view);
          const backRange1 = getDefaultCalendarDateRange({
            baseDate: backwardDate1,
            view,
            weekStartDay,
          });

          const backwardDate2 = subtractByOnePeriod(baseDate, view);
          const backRange2 = getDefaultCalendarDateRange({
            baseDate: backwardDate2,
            view,
            weekStartDay,
          });

          expect(backRange1.start.getTime()).toBe(backRange2.start.getTime());
          expect(backRange1.end.getTime()).toBe(backRange2.end.getTime());
        },
      ),
    );
  });
});
