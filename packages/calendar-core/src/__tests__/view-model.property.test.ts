import fc from "fast-check";
import {
  createCalendarMap,
  createVisibleCalendarIdSet,
  transformCalendarEvents,
} from "../view-model";
import type { Calendar, CalendarEvent } from "../types";

/**
 * Property 7: Visible calendar event filtering
 *
 * For any set of calendars with arbitrary visibility states and any set of
 * events assigned to those calendars, `transformCalendarEvents` returns only
 * events whose `calendarId` belongs to a visible calendar. The result set
 * size is less than or equal to the input event count, and every returned
 * event has a `calendarId` present in the visible calendar set.
 *
 * **Validates: Requirements 6.9**
 */

const calendarKindArb = fc.constantFrom(
  "owned" as const,
  "subscribed" as const,
  "public_holiday" as const,
);

const eventColorArb = fc.constantFrom(
  "blue",
  "orange",
  "violet",
  "rose",
  "emerald",
  "red",
  "cyan",
  "lime",
  "amber",
  "indigo",
  "pink",
  "teal",
);

const fixedDate = new Date("2024-01-15T12:00:00Z");

function makeCalendarArb(id: string): fc.Arbitrary<Calendar> {
  return fc
    .record({
      isVisible: fc.boolean(),
      color: eventColorArb,
      kind: calendarKindArb,
      isPublic: fc.boolean(),
      isDefault: fc.boolean(),
      isSyncOnly: fc.boolean(),
    })
    .map((fields) => ({
      id,
      name: `Calendar ${id}`,
      ...fields,
      userId: "user-1",
      createdAt: fixedDate,
      updatedAt: fixedDate,
    }));
}

function makeEventArb(
  id: string,
  calendarId: string,
): fc.Arbitrary<CalendarEvent> {
  return fc.constant({
    id,
    title: `Event ${id}`,
    start: fixedDate,
    end: new Date(fixedDate.getTime() + 3600000),
    calendarId,
    userId: "user-1",
    createdAt: fixedDate,
    updatedAt: fixedDate,
  });
}

// Generate a list of 1-10 calendars with unique IDs, then events referencing those calendars
const calendarsAndEventsArb = fc
  .integer({ min: 1, max: 10 })
  .chain((calendarCount) => {
    const calendarIds = Array.from(
      { length: calendarCount },
      (_, i) => `cal-${i}`,
    );
    const calendarsArb = fc.tuple(
      ...calendarIds.map((id) => makeCalendarArb(id)),
    );

    return calendarsArb.chain((calendars) => {
      // Generate 0-20 events, each assigned to a random calendar from the set
      const eventsArb = fc
        .array(fc.integer({ min: 0, max: calendarCount - 1 }), {
          minLength: 0,
          maxLength: 20,
        })
        .chain((calendarIndices) =>
          fc.tuple(
            ...calendarIndices.map((calIdx, evtIdx) =>
              makeEventArb(`evt-${evtIdx}`, calendarIds[calIdx]),
            ),
          ),
        );

      return fc.tuple(fc.constant(calendars), eventsArb);
    });
  });

describe("transformCalendarEvents - Property Tests", () => {
  it("should return only events whose calendarId belongs to a visible calendar", () => {
    fc.assert(
      fc.property(calendarsAndEventsArb, ([calendars, events]) => {
        const calendarMap = createCalendarMap(calendars);
        const visibleCalendarIds = createVisibleCalendarIdSet(
          calendars,
          (calendarId) => calendarMap.get(calendarId)?.isVisible ?? false,
        );

        const result = transformCalendarEvents(
          events,
          calendarMap,
          visibleCalendarIds,
        );

        // Every returned event must have a calendarId in the visible set
        for (const event of result) {
          expect(visibleCalendarIds.has(event.calendarId)).toBe(true);
        }
      }),
    );
  });

  it("should return a result set size less than or equal to the input event count", () => {
    fc.assert(
      fc.property(calendarsAndEventsArb, ([calendars, events]) => {
        const calendarMap = createCalendarMap(calendars);
        const visibleCalendarIds = createVisibleCalendarIdSet(
          calendars,
          (calendarId) => calendarMap.get(calendarId)?.isVisible ?? false,
        );

        const result = transformCalendarEvents(
          events,
          calendarMap,
          visibleCalendarIds,
        );

        expect(result.length).toBeLessThanOrEqual(events.length);
      }),
    );
  });

  it("should include all events from visible calendars and exclude all events from hidden calendars", () => {
    fc.assert(
      fc.property(calendarsAndEventsArb, ([calendars, events]) => {
        const calendarMap = createCalendarMap(calendars);
        const visibleCalendarIds = createVisibleCalendarIdSet(
          calendars,
          (calendarId) => calendarMap.get(calendarId)?.isVisible ?? false,
        );

        const result = transformCalendarEvents(
          events,
          calendarMap,
          visibleCalendarIds,
        );

        // Count how many input events belong to visible calendars
        const expectedCount = events.filter((e) =>
          visibleCalendarIds.has(e.calendarId),
        ).length;

        expect(result.length).toBe(expectedCount);

        // No event from a hidden calendar should appear in the result
        const hiddenCalendarIds = new Set(
          calendars
            .filter((c) => !visibleCalendarIds.has(c.id))
            .map((c) => c.id),
        );
        for (const event of result) {
          expect(hiddenCalendarIds.has(event.calendarId)).toBe(false);
        }
      }),
    );
  });
});
