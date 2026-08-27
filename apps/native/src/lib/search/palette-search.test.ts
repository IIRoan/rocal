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
  it("finds historical titles from the local index even when live search is empty", () => {
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
      messages: [],
      limit: 8,
    });

    expect(results.map((result) => result.id)).toEqual([
      "mail:m-1",
      "calendar:event-old",
    ]);
    expect(results[1]?.encryptionStatus).toBe("encrypted-indexed");
  });

  it("keeps a live event hit when the same id is already in the title index", () => {
    const live = event({ title: "Board offsite" });
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
      messages: [],
      limit: 8,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("calendar:event-old");
  });
});
