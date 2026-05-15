import { describe, expect, it } from "@jest/globals";

import { createDraftCalendarEvent } from "../../lib/calendar-event-drafts";

describe("calendar-event-drafts", () => {
  it("creates a normalized draft event with the preferred calendar and duration", () => {
    const event = createDraftCalendarEvent({
      defaultCalendarId: "calendar-primary",
      fallbackCalendarId: "calendar-fallback",
      durationMinutes: 90,
      start: new Date("2026-04-24T12:34:56.789Z"),
    });

    expect(event.id).toBeUndefined();
    expect(event.calendarId).toBe("calendar-primary");
    expect(event.start.toISOString()).toBe("2026-04-24T12:34:00.000Z");
    expect(event.end.toISOString()).toBe("2026-04-24T14:04:00.000Z");
    expect(event.title).toBe("");
    expect(event.allDay).toBe(false);
  });

  it("falls back to the first available calendar and then to an empty value", () => {
    const fallbackEvent = createDraftCalendarEvent({
      fallbackCalendarId: "calendar-fallback",
      start: new Date("2026-04-24T08:15:00.000Z"),
    });
    const emptyEvent = createDraftCalendarEvent({
      start: new Date("2026-04-24T08:15:00.000Z"),
    });

    expect(fallbackEvent.calendarId).toBe("calendar-fallback");
    expect(emptyEvent.calendarId).toBe("");
  });
});
