import { describe, expect, it } from "@jest/globals";
import type { CalendarEvent } from "@workspace/calendar-core";
import { mergePaletteSearchResults } from "./palette-search";

const event = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: "event-old",
  title: "Board offsite",
  start: new Date("2024-01-10T09:00:00.000Z"),
  end: new Date("2024-01-10T10:00:00.000Z"),
  calendarId: "cal-1",
  userId: "user-1",
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  ...overrides,
});

describe("mergePaletteSearchResults", () => {
  it("finds historical event titles from the local index and ignores mail documents", () => {
    const results = mergePaletteSearchResults({
      titleDocuments: [
        {
          id: "calendar:event-old",
          source: "calendar",
          title: "Board offsite",
          eventId: "event-old",
          timestamp: "2024-01-10T09:00:00.000Z",
          encryptionStatus: "encrypted-indexed",
        },
        {
          id: "mail:m-1",
          source: "mail",
          title: "Board offsite notes",
          messageId: "m-1",
          timestamp: "2024-01-11T09:00:00.000Z",
          encryptionStatus: "plaintext",
        },
      ],
      query: "offsite",
      events: [],
      limit: 8,
    });

    expect(results.map((result) => result.id)).toEqual(["calendar:event-old"]);
    expect(results[0]?.encryptionStatus).toBe("encrypted-indexed");
  });

  it("keeps the full in-memory event over the index stub for the same id", () => {
    const live = event({ title: "Board offsite", allDay: true });
    const results = mergePaletteSearchResults({
      titleDocuments: [
        {
          id: "calendar:event-old",
          source: "calendar",
          title: "Board offsite",
          eventId: "event-old",
          encryptionStatus: "encrypted-indexed",
        },
      ],
      query: "offsite",
      events: [live],
      limit: 8,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.event).toBe(live);
  });

  it("matches descriptions and locations of in-memory events on the device", () => {
    const results = mergePaletteSearchResults({
      titleDocuments: [],
      query: "lisbon",
      events: [
        event({ id: "trip", title: "Trip", location: "Lisbon" }),
        event({ id: "review", title: "Review", description: "Budget for Lisbon" }),
        event({ id: "other", title: "Standup" }),
      ],
      limit: 8,
    });

    expect(results.map((result) => result.eventId).sort()).toEqual([
      "review",
      "trip",
    ]);
  });
});
