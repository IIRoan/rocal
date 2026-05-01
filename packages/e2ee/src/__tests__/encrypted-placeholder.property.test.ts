import { describe, it, expect } from "@jest/globals";
import fc from "fast-check";
import type { CalendarEvent } from "@workspace/calendar-core";
import {
  hydrateEncryptedEventWithoutSession,
  ENCRYPTED_EVENT_PLACEHOLDER_TITLE,
} from "../hydration";

/**
 * Property 12: Encrypted event placeholder without session
 *
 * For any event with `encryptionState === "encrypted"` and non-null
 * `encryptedContent`, when no E2EE session is active,
 * `hydrateEncryptedEventWithoutSession` SHALL return an event with title
 * equal to "Encrypted event" (or the original trimmed title if non-empty)
 * and description and location set to null.
 *
 * **Validates: Requirements 11.6**
 */

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const dateArb = fc.date({
  min: new Date("2000-01-01T00:00:00Z"),
  max: new Date("2099-12-31T23:59:59Z"),
});

/**
 * Generate an encrypted CalendarEvent with encryptionState "encrypted"
 * and a non-null encryptedContent string.
 */
const encryptedEventArb: fc.Arbitrary<CalendarEvent> = fc
  .record({
    id: fc.string({ minLength: 1, maxLength: 36 }),
    title: fc.string({ maxLength: 255 }),
    description: fc.option(fc.string({ maxLength: 1000 }), { nil: null }),
    location: fc.option(fc.string({ maxLength: 500 }), { nil: null }),
    encryptedContent: fc.string({ minLength: 1, maxLength: 500 }),
    calendarId: fc.string({ minLength: 1, maxLength: 36 }),
    userId: fc.string({ minLength: 1, maxLength: 36 }),
    start: dateArb,
    end: dateArb,
    createdAt: dateArb,
    updatedAt: dateArb,
  })
  .map((fields) => ({
    ...fields,
    encryptionState: "encrypted" as const,
  }));

/**
 * Generate a non-encrypted CalendarEvent (encryptionState is NOT "encrypted"
 * or encryptedContent is null/undefined).
 */
const nonEncryptedEventArb: fc.Arbitrary<CalendarEvent> = fc.oneof(
  // Case 1: encryptionState is not "encrypted"
  fc
    .record({
      id: fc.string({ minLength: 1, maxLength: 36 }),
      title: fc.string({ minLength: 1, maxLength: 255 }),
      description: fc.option(fc.string({ maxLength: 1000 }), { nil: null }),
      location: fc.option(fc.string({ maxLength: 500 }), { nil: null }),
      encryptedContent: fc.option(fc.string({ maxLength: 500 }), {
        nil: null,
      }),
      encryptionState: fc.constantFrom(
        "plaintext" as const,
        "shadow_write" as const,
      ),
      calendarId: fc.string({ minLength: 1, maxLength: 36 }),
      userId: fc.string({ minLength: 1, maxLength: 36 }),
      start: dateArb,
      end: dateArb,
      createdAt: dateArb,
      updatedAt: dateArb,
    })
    .map((fields) => fields as CalendarEvent),
  // Case 2: encryptionState is "encrypted" but encryptedContent is null/undefined
  fc
    .record({
      id: fc.string({ minLength: 1, maxLength: 36 }),
      title: fc.string({ minLength: 1, maxLength: 255 }),
      description: fc.option(fc.string({ maxLength: 1000 }), { nil: null }),
      location: fc.option(fc.string({ maxLength: 500 }), { nil: null }),
      calendarId: fc.string({ minLength: 1, maxLength: 36 }),
      userId: fc.string({ minLength: 1, maxLength: 36 }),
      start: dateArb,
      end: dateArb,
      createdAt: dateArb,
      updatedAt: dateArb,
    })
    .map(
      (fields) =>
        ({
          ...fields,
          encryptionState: "encrypted" as const,
          encryptedContent: null,
        }) as CalendarEvent,
    ),
);

// ─── Property Tests ──────────────────────────────────────────────────────────

describe("Encrypted event placeholder without session - Property Tests", () => {
  describe("Placeholder title for encrypted events", () => {
    it("should use trimmed original title if non-empty after trimming, otherwise 'Encrypted event'", () => {
      fc.assert(
        fc.property(encryptedEventArb, (event) => {
          const result = hydrateEncryptedEventWithoutSession(event);

          const trimmedTitle = event.title?.trim();
          if (trimmedTitle && trimmedTitle.length > 0) {
            expect(result.title).toBe(trimmedTitle);
          } else {
            expect(result.title).toBe(ENCRYPTED_EVENT_PLACEHOLDER_TITLE);
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("Null description and location for encrypted events", () => {
    it("should set description and location to null regardless of original values", () => {
      fc.assert(
        fc.property(encryptedEventArb, (event) => {
          const result = hydrateEncryptedEventWithoutSession(event);

          expect(result.description).toBeNull();
          expect(result.location).toBeNull();
          expect(result.encryptionState).toBe("encrypted");
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("Non-encrypted events pass through unchanged", () => {
    it("should return the event unchanged when not encrypted or no encrypted content", () => {
      fc.assert(
        fc.property(nonEncryptedEventArb, (event) => {
          const result = hydrateEncryptedEventWithoutSession(event);

          expect(result).toBe(event);
        }),
        { numRuns: 100 },
      );
    });
  });
});
