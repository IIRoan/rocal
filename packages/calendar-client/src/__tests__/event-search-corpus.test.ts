import { describe, expect, it, jest } from "@jest/globals";
import type {
  CalendarEvent,
  EventSearchCorpusParams,
  EventSearchCorpusResult,
} from "@workspace/calendar-core";

import {
  loadEventSearchCorpus,
  sealReadableInvitations,
} from "../event-search-corpus";

const event = (id: string): CalendarEvent => ({
  id,
  title: `Event ${id}`,
  start: new Date("2026-08-24T09:00:00.000Z"),
  end: new Date("2026-08-24T09:30:00.000Z"),
  calendarId: "cal-1",
  userId: "user-1",
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
});

function pagedCorpus(pages: CalendarEvent[][]) {
  return jest.fn(
    async (params: EventSearchCorpusParams = {}): Promise<EventSearchCorpusResult> => {
      const index = (params.offset ?? 0) / 100;
      return {
        events: pages[index] ?? [],
        total: pages.flat().length,
        nextOffset: index + 1 < pages.length ? (index + 1) * 100 : null,
      };
    },
  );
}

describe("loadEventSearchCorpus", () => {
  it("reads every page and never sends a search word", async () => {
    const getEventSearchCorpus = pagedCorpus([[event("a")], [event("b")]]);

    const events = await loadEventSearchCorpus({ getEventSearchCorpus });

    expect(events.map((e) => e.id)).toEqual(["a", "b"]);
    expect(getEventSearchCorpus.mock.calls.map(([params]) => params)).toEqual([
      { limit: 100, offset: 0 },
      { limit: 100, offset: 100 },
    ]);
  });
});

describe("sealReadableInvitations", () => {
  it("seals every readable invitation copy the server lists", async () => {
    const getEventSearchCorpus = pagedCorpus([[event("a"), event("b")]]);
    const sealImportedInvitationIfNeeded = jest.fn(async (e: CalendarEvent) => e);

    await sealReadableInvitations({
      getEventSearchCorpus,
      sealImportedInvitationIfNeeded,
    });

    expect(getEventSearchCorpus).toHaveBeenCalledWith(
      { readableInvitations: true, limit: 100, offset: 0 },
      undefined,
    );
    expect(sealImportedInvitationIfNeeded.mock.calls.map(([e]) => e.id)).toEqual([
      "a",
      "b",
    ]);
  });
});
