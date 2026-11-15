import { describe, expect, it, jest } from "@jest/globals";
import { QueryClient } from "@tanstack/react-query";
import { EVENTS_QUERY_KEY } from "@workspace/calendar-core";

jest.mock("../../lib/calendar-api-service", () => ({ calendarApiService: {} }));
jest.mock("../../lib/e2ee-notification-title", () => ({
  encryptReminderTitle: jest.fn(),
}));

import type { CalendarEvent } from "../../lib/types/calendar";
import {
  patchCachedEventTiming,
  restoreEventCache,
} from "../../hooks/use-calendar-data";

const standup = {
  id: "event-1",
  title: "Standup",
  calendarId: "cal-1",
  userId: "user-1",
  allDay: false,
  start: new Date("2026-06-08T09:00:00.000Z"),
  end: new Date("2026-06-08T09:30:00.000Z"),
  createdAt: new Date("2026-05-01T00:00:00.000Z"),
  updatedAt: new Date("2026-05-01T00:00:00.000Z"),
} as CalendarEvent;
const other = { ...standup, id: "event-2", title: "Lunch" };
const rangeKey = [...EVENTS_QUERY_KEY, "2026-06"];

describe("patchCachedEventTiming", () => {
  it("moves only the edited event's times at once and restores them on failure", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(rangeKey, [standup, other]);

    const context = await patchCachedEventTiming(queryClient, "event-1", {
      start: "2026-06-08T09:00:00.000Z",
      end: "2026-06-08T10:15:00.000Z",
      allDay: false,
      title: "Not applied",
    });

    const patched = queryClient.getQueryData<CalendarEvent[]>(rangeKey);
    expect(patched?.[0]?.end).toEqual(new Date("2026-06-08T10:15:00.000Z"));
    expect(patched?.[0]?.title).toBe("Standup");
    expect(patched?.[1]).toBe(other);
    expect(context.previous).toBe(standup);

    restoreEventCache(queryClient, context.snapshot);
    expect(queryClient.getQueryData(rangeKey)).toEqual([standup, other]);
  });

  it("leaves the cache and its fetches alone for a content-only edit", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(rangeKey, [standup, other]);
    const cancel = jest.spyOn(queryClient, "cancelQueries");
    const setData = jest.spyOn(queryClient, "setQueriesData");

    const context = await patchCachedEventTiming(queryClient, "event-1", { title: "Retro" });

    expect(cancel).not.toHaveBeenCalled();
    expect(setData).not.toHaveBeenCalled();
    expect(context).toEqual({ previous: standup, snapshot: undefined });
  });
});
