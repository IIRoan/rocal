import { describe, expect, it, jest } from "@jest/globals";
import type { CalendarEvent, EventSearchCorpusParams } from "@workspace/calendar-core";

import { loadCalendarIcsExport } from "../calendar-ics-export";

const event = (id: string, calendarId: string): CalendarEvent => ({
  id,
  title: `Event ${id}`,
  start: new Date("2026-03-02T09:00:00.000Z"),
  end: new Date("2026-03-02T10:00:00.000Z"),
  calendarId,
  userId: "user-1",
  createdAt: new Date("2026-03-01T00:00:00.000Z"),
  updatedAt: new Date("2026-03-01T00:00:00.000Z"),
});

function corpusApi() {
  const getEventSearchCorpus = jest.fn(async (_params: EventSearchCorpusParams) => ({
    events: [event("a", "work"), event("b", "home"), event("c", "feed")],
    total: 3,
    nextOffset: null,
  }));
  return { getEventSearchCorpus };
}

describe("loadCalendarIcsExport", () => {
  it("asks for series exceptions and keeps only the chosen calendar's events", async () => {
    const api = corpusApi();

    const { icsContent, filename } = await loadCalendarIcsExport(api, {
      calendars: [{ id: "work", name: "Work" }],
      timezone: "Europe/Amsterdam",
    });

    expect(api.getEventSearchCorpus).toHaveBeenCalledWith(
      expect.objectContaining({ includeExceptions: true }),
      undefined,
    );
    expect(filename).toBe("work.ics");
    expect(icsContent).toContain("SUMMARY:Event a");
    expect(icsContent).not.toContain("SUMMARY:Event b");
  });

  it("combines several calendars into one file", async () => {
    const { icsContent, filename } = await loadCalendarIcsExport(corpusApi(), {
      calendars: [
        { id: "work", name: "Work" },
        { id: "home", name: "Home" },
      ],
    });

    expect(filename).toBe("solace-calendars.ics");
    expect(icsContent).toContain("SUMMARY:Event a");
    expect(icsContent).toContain("SUMMARY:Event b");
    expect(icsContent).not.toContain("SUMMARY:Event c");
  });
});
