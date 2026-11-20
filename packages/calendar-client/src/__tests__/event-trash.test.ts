import { describe, expect, it, jest } from "@jest/globals";
import { QueryClient } from "@tanstack/react-query";
import {
  EVENT_TRASH_QUERY_KEY,
  type CalendarEvent,
  type TrashedCalendarEvent,
} from "@workspace/calendar-core";
import { NoopE2eeProvider } from "@workspace/e2ee";

import { CalendarApiService } from "../calendar-api-service";
import {
  deleteTrashedEventMutationOptions,
  emptyEventTrashMutationOptions,
  restoreTrashedEventMutationOptions,
} from "../event-trash-query-options";
import { HttpClient } from "../http-client";
import { persistRecurringEventDelete } from "../recurring-event-persistence";

class OpeningProvider extends NoopE2eeProvider {
  async hydrateEncryptedEvent(event: CalendarEvent) {
    if (event.encryptedContent !== "sealed:Dentist") throw new Error("cannot open");
    return { ...event, title: "Dentist" };
  }
}

const entry = (id: string, encryptedContent: string) => ({
  id,
  eventId: `event-${id}`,
  calendarId: "cal-1",
  calendarMissing: false,
  title: "",
  encryptedContent,
  encryptionState: "encrypted",
  encryptionKeyVersion: 1,
  start: "2099-03-02T09:00:00.000Z",
  end: "2099-03-02T10:00:00.000Z",
  allDay: false,
  timezone: "Europe/Amsterdam",
  recurrence: null,
  trashedAt: "2026-11-14T12:00:00.000Z",
  purgeAt: "2026-12-14T12:00:00.000Z",
});

function setup() {
  const client = new HttpClient({ baseURL: "https://api.test", retries: 0 });
  const get = jest
    .spyOn(client, "get")
    .mockResolvedValue({ events: [entry("t1", "sealed:Dentist"), entry("t2", "other-key")] } as never);
  const post = jest.spyOn(client, "post").mockResolvedValue({ id: "event-t1", encryptedContent: "sealed:Dentist", encryptionState: "encrypted" } as never);
  const del = jest.spyOn(client, "delete").mockResolvedValue({ success: true, message: "" } as never);
  return { get, post, del, service: new CalendarApiService(client, new OpeningProvider()) };
}

describe("event trash", () => {
  it("lists entries with titles opened on this device and a placeholder otherwise", async () => {
    const { get, service } = setup();

    const trash = await service.listTrashedEvents();

    expect(get).toHaveBeenCalledWith("/api/events/trash");
    expect(trash.map(({ id, eventId, title }) => ({ id, eventId, title }))).toEqual([
      { id: "t1", eventId: "event-t1", title: "Dentist" },
      { id: "t2", eventId: "event-t2", title: "Encrypted event" },
    ]);
    expect(trash[0]?.purgeAt).toEqual(new Date("2026-12-14T12:00:00.000Z"));
  });

  it("restores, purges and empties by entry id", async () => {
    const { post, del, service } = setup();

    await expect(service.restoreTrashedEvent("t/1")).resolves.toMatchObject({ id: "event-t1", title: "Dentist" });
    await service.deleteTrashedEvent("t/1");
    await service.emptyEventTrash();

    expect(post).toHaveBeenCalledWith("/api/events/trash/t%2F1/restore", {});
    expect(del.mock.calls.map(([path]) => path)).toEqual(["/api/events/trash/t%2F1", "/api/events/trash"]);
  });

  it("returns the trash id a delete leaves, and null for a permanent occurrence delete", async () => {
    const event = { id: "series-1", recurrence: "{}", start: new Date("2099-03-02T09:00:00.000Z") } as CalendarEvent;
    const api = {
      deleteEvent: jest.fn(async () => ({ success: true, message: "", trashId: "t1" })),
      deleteRecurringEvent: jest.fn(async (_id: string, scope: string) => ({ success: true, message: "", deletedEventId: "series-1", action: scope, ...(scope === "all" ? { trashId: "t2" } : {}) })),
      editRecurringEvent: jest.fn(),
      getEvent: jest.fn(),
      updateEvent: jest.fn(),
    };

    await expect(persistRecurringEventDelete(api as never, { event: { ...event, recurrence: null }, scope: "all" })).resolves.toBe("t1");
    await expect(persistRecurringEventDelete(api as never, { event, scope: "all" })).resolves.toBe("t2");
    await expect(persistRecurringEventDelete(api as never, { event, scope: "this_and_future" })).resolves.toBeNull();
  });
});

describe("event trash mutation options", () => {
  const cached = (ids: string[]) => ids.map((id) => ({ id }) as TrashedCalendarEvent);
  const ids = (client: QueryClient) =>
    client.getQueryData<TrashedCalendarEvent[]>(EVENT_TRASH_QUERY_KEY)?.map((e) => e.id);

  it("takes a restored entry out of the cached trash at once and puts it back on failure", async () => {
    const client = new QueryClient();
    client.setQueryData(EVENT_TRASH_QUERY_KEY, cached(["t1", "t2"]));
    const options = restoreTrashedEventMutationOptions(
      { restoreTrashedEvent: jest.fn(async () => ({ id: "event-t1" }) as CalendarEvent) },
      client,
    );

    const context = await options.onMutate("t1");
    expect(ids(client)).toEqual(["t2"]);
    options.onError(new Error("offline"), "t1", context);
    expect(ids(client)).toEqual(["t1", "t2"]);
  });

  it("removes purged entries and empties the cached trash optimistically", async () => {
    const client = new QueryClient();
    client.setQueryData(EVENT_TRASH_QUERY_KEY, cached(["t1", "t2"]));
    const api = { deleteTrashedEvent: jest.fn(), emptyEventTrash: jest.fn() } as never;

    await deleteTrashedEventMutationOptions(api, client).onMutate("t2");
    expect(ids(client)).toEqual(["t1"]);
    const emptied = emptyEventTrashMutationOptions(api, client);
    const context = await emptied.onMutate();
    expect(ids(client)).toEqual([]);
    emptied.onError(new Error("offline"), undefined, context);
    expect(ids(client)).toEqual(["t1"]);
  });
});
