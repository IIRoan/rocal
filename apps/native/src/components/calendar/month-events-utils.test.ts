import type { EventsResponse } from "@workspace/calendar-core";
import { mergeMonthEventResponses } from "./month-events-utils";

function createResponse(
  eventIds: string[],
  calendarIds: string[],
  categoryIds: string[],
): EventsResponse {
  return {
    events: eventIds.map((id, index) => ({
      id,
      title: id,
      start: new Date(2026, 0, index + 1, 9, 0, 0),
      end: new Date(2026, 0, index + 1, 10, 0, 0),
      calendarId: calendarIds[0] ?? "calendar-1",
      userId: "user-1",
      createdAt: new Date(2026, 0, 1),
      updatedAt: new Date(2026, 0, 1),
    })),
    calendars: calendarIds.map((id) => ({
      id,
      name: id,
      color: "teal",
      kind: "owned",
      isPublic: false,
      isVisible: true,
      isDefault: false,
      isSyncOnly: false,
      userId: "user-1",
      createdAt: new Date(2026, 0, 1),
      updatedAt: new Date(2026, 0, 1),
    })),
    categories: categoryIds.map((id) => ({
      id,
      name: id,
      color: "amber",
      isActive: true,
      userId: "user-1",
      createdAt: new Date(2026, 0, 1),
      updatedAt: new Date(2026, 0, 1),
    })),
  };
}

describe("mergeMonthEventResponses", () => {
  it("merges adjacent month responses without duplicating overlapping records", () => {
    const merged = mergeMonthEventResponses([
      createResponse(["event-a", "event-b"], ["calendar-1"], ["category-1"]),
      createResponse(["event-b", "event-c"], ["calendar-1"], ["category-2"]),
      undefined,
      createResponse(["event-c", "event-d"], ["calendar-2"], ["category-2"]),
    ]);

    expect(merged.events.map((event) => event.id)).toEqual([
      "event-a",
      "event-b",
      "event-c",
      "event-d",
    ]);
    expect(merged.calendars.map((calendar) => calendar.id)).toEqual([
      "calendar-1",
      "calendar-2",
    ]);
    expect(merged.categories.map((category) => category.id)).toEqual([
      "category-1",
      "category-2",
    ]);
  });

  it("returns an empty response when no month queries have resolved yet", () => {
    expect(mergeMonthEventResponses([])).toEqual({
      events: [],
      calendars: [],
      categories: [],
    });
  });
});
