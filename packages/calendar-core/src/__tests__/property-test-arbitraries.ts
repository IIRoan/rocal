import fc from "fast-check";

const MIN_BASE_DATE_MS = new Date(2000, 0, 1).getTime();
const MAX_BASE_DATE_MS = new Date(2099, 11, 31, 23, 59, 59, 999).getTime();

/**
 * Calendar dates for property tests. Uses integer timestamps instead of
 * `fc.date()` so invalid Date values (NaN) never reach date-fns helpers.
 */
export const validBaseDateArb: fc.Arbitrary<Date> = fc
  .integer({ min: MIN_BASE_DATE_MS, max: MAX_BASE_DATE_MS })
  .map((ms) => {
    const normalized = new Date(ms);
    normalized.setHours(12, 0, 0, 0);
    return normalized;
  });
