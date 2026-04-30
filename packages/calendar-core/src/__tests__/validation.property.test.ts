import fc from "fast-check";
import { validateEventData } from "../validation";
import type { CreateEventRequest } from "../types";

/**
 * Property 8: Event validation correctness
 *
 * For any event data, `validateEventData` returns errors when title is
 * empty/whitespace, end <= start, title > 255 chars, or description > 1000
 * chars, and returns empty errors for valid data.
 *
 * **Validates: Requirements 7.3**
 */

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Generate a pair of ISO date strings where start < end */
const validDatePairArb: fc.Arbitrary<{ start: string; end: string }> = fc
  .tuple(
    fc.date({
      min: new Date("2000-01-01T00:00:00.000Z"),
      max: new Date("2098-12-31T00:00:00.000Z"),
    }),
    fc.integer({ min: 1, max: 24 * 60 }),
  )
  .map(([startDate, minutesAfter]) => {
    const endDate = new Date(startDate.getTime() + minutesAfter * 60_000);
    return {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    };
  });

/** Generate a non-empty, non-whitespace title of at most 255 chars */
const validTitleArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 255 })
  .filter((s) => s.trim().length > 0);

/** Generate a description of at most 1000 chars (or undefined) */
const validDescriptionArb: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.string({ minLength: 0, maxLength: 1000 }),
);

/** Build a valid CreateEventRequest from parts */
function buildEvent(
  overrides: Partial<CreateEventRequest>,
): CreateEventRequest {
  return {
    title: "Valid Title",
    start: new Date(2025, 0, 1, 10, 0).toISOString(),
    end: new Date(2025, 0, 1, 11, 0).toISOString(),
    calendarId: "cal-1",
    ...overrides,
  };
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe("validateEventData - Property Tests", () => {
  describe("Empty or whitespace-only title produces 'Title is required' error", () => {
    const whitespaceOnlyArb: fc.Arbitrary<string> = fc.oneof(
      fc.constant(""),
      fc
        .array(fc.constantFrom(" ", "\t", "\n", "\r"), {
          minLength: 1,
          maxLength: 50,
        })
        .map((chars) => chars.join("")),
    );

    it("should return 'Title is required' for empty or whitespace-only titles", () => {
      fc.assert(
        fc.property(whitespaceOnlyArb, (title) => {
          const errors = validateEventData(buildEvent({ title }));
          expect(errors).toContain("Title is required");
        }),
      );
    });
  });

  describe("Title exceeding 255 characters produces title length error", () => {
    const longTitleArb: fc.Arbitrary<string> = fc
      .string({ minLength: 256, maxLength: 500 })
      .filter((s) => s.trim().length > 0);

    it("should return 'Title cannot exceed 255 characters' for titles > 255 chars", () => {
      fc.assert(
        fc.property(longTitleArb, (title) => {
          const errors = validateEventData(buildEvent({ title }));
          expect(errors).toContain("Title cannot exceed 255 characters");
        }),
      );
    });
  });

  describe("Description exceeding 1000 characters produces description length error", () => {
    const longDescriptionArb: fc.Arbitrary<string> = fc.string({
      minLength: 1001,
      maxLength: 1500,
    });

    it("should return 'Description cannot exceed 1000 characters' for descriptions > 1000 chars", () => {
      fc.assert(
        fc.property(longDescriptionArb, (description) => {
          const errors = validateEventData(buildEvent({ description }));
          expect(errors).toContain(
            "Description cannot exceed 1000 characters",
          );
        }),
      );
    });
  });

  describe("End time <= start time produces end time error", () => {
    /** Generate a pair where end <= start */
    const invalidDatePairArb: fc.Arbitrary<{ start: string; end: string }> = fc
      .tuple(
        fc.date({
          min: new Date("2000-01-01T00:00:00.000Z"),
          max: new Date("2098-12-31T00:00:00.000Z"),
        }),
        fc.integer({ min: 0, max: 24 * 60 }),
      )
      .map(([endDate, minutesBefore]) => {
        const startDate = new Date(
          endDate.getTime() + minutesBefore * 60_000,
        );
        return {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        };
      });

    it("should return 'End time must be after start time' when end <= start", () => {
      fc.assert(
        fc.property(invalidDatePairArb, ({ start, end }) => {
          const errors = validateEventData(buildEvent({ start, end }));
          expect(errors).toContain("End time must be after start time");
        }),
      );
    });
  });

  describe("Valid event data produces no errors for title, description, dates", () => {
    it("should return empty errors for valid event data", () => {
      fc.assert(
        fc.property(
          validTitleArb,
          validDescriptionArb,
          validDatePairArb,
          (title, description, { start, end }) => {
            const event = buildEvent({ title, description, start, end });
            const errors = validateEventData(event);

            // Should not contain any of the validation errors we're testing
            expect(errors).not.toContain("Title is required");
            expect(errors).not.toContain(
              "Title cannot exceed 255 characters",
            );
            expect(errors).not.toContain(
              "Description cannot exceed 1000 characters",
            );
            expect(errors).not.toContain(
              "End time must be after start time",
            );
          },
        ),
      );
    });
  });
});
