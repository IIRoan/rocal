import { QueryClient } from "@tanstack/react-query";
import {
  generateOptimisticId,
  buildOptimisticEvent,
  commitOptimisticEvent,
  findCachedEvent,
  invalidateEventRanges,
  optimisticallyInsertEvent,
  optimisticallyPatchEvent,
  optimisticallyRemoveEvent,
  readCachedEventsForRange,
  rollbackFromSnapshot,
} from "./optimistic-events";
import type {
  CalendarEvent,
  CreateEventRequest,
  EventsResponse,
} from "@workspace/calendar-core";

function makeEventResponse(events: CalendarEvent[]): EventsResponse {
  return { events, categories: [], calendars: [] };
}

function makeMockQueryClient(initial: Record<string, EventsResponse>) {
  const store: Record<string, EventsResponse | undefined> = { ...initial };
  const cancelledKeys: unknown[] = [];

  return {
    cancelQueries: jest.fn(async ({ queryKey }: { queryKey: unknown[] }) => {
      cancelledKeys.push(queryKey);
    }),
    getQueriesData: jest.fn(({ queryKey }: { queryKey: unknown[] }) => {
      const prefix = queryKey[0];
      return Object.entries(store)
        .filter(([k]) => k.startsWith(String(prefix)))
        .map(([k, v]) => {
          const parts = k.split("|");
          return [parts, v] as [string[], EventsResponse | undefined];
        });
    }),
    setQueryData: jest.fn((queryKey: string[], updater: unknown) => {
      const key = queryKey.join("|");
      if (typeof updater === "function") {
        store[key] = (
          updater as (
            prev: EventsResponse | undefined,
          ) => EventsResponse | undefined
        )(store[key]);
      } else {
        store[key] = updater as EventsResponse | undefined;
      }
    }),
    getQueryData: jest.fn((queryKey: string[]) => {
      return store[queryKey.join("|")];
    }),
    _store: store,
  };
}

const BASE_REQUEST: CreateEventRequest = {
  title: "Team meeting",
  start: "2024-03-15T09:00:00",
  end: "2024-03-15T10:00:00",
  calendarId: "cal-1",
  allDay: false,
};

const TIMED_REQUEST: CreateEventRequest = {
  ...BASE_REQUEST,
  start: "2024-03-15T09:00:00.000Z",
  end: "2024-03-15T10:00:00.000Z",
};

const EXISTING_EVENT: CalendarEvent = {
  id: "ev-existing",
  title: "Existing",
  description: null,
  start: new Date("2024-03-15T08:00:00"),
  end: new Date("2024-03-15T08:30:00"),
  timezone: null,
  allDay: false,
  location: null,
  color: null,
  calendarId: "cal-1",
  categoryId: null,
  userId: "user-1",
  reminder: null,
  recurrence: null,
  parentEventId: null,
  isRecurringInstance: false,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

describe("generateOptimisticId", () => {
  it("returns a string prefixed with __optimistic__", () => {
    const id = generateOptimisticId();
    expect(id).toMatch(/^__optimistic__/);
  });

  it("generates unique IDs on each call", () => {
    const ids = new Set(
      Array.from({ length: 50 }, () => generateOptimisticId()),
    );
    expect(ids.size).toBe(50);
  });
});

describe("buildOptimisticEvent", () => {
  it("builds an event with the provided tempId and userId", () => {
    const event = buildOptimisticEvent(BASE_REQUEST, "user-42", "temp-id-1");
    expect(event.id).toBe("temp-id-1");
    expect(event.userId).toBe("user-42");
  });

  it("copies title, start, end, calendarId from request", () => {
    const event = buildOptimisticEvent(BASE_REQUEST, "u", "t");
    expect(event.title).toBe("Team meeting");
    expect(event.start).toEqual(new Date("2024-03-15T09:00:00"));
    expect(event.end).toEqual(new Date("2024-03-15T10:00:00"));
    expect(event.calendarId).toBe("cal-1");
  });

  it("defaults allDay to false when not provided", () => {
    const { allDay: _, ...withoutAllDay } = BASE_REQUEST;
    const event = buildOptimisticEvent(
      withoutAllDay as CreateEventRequest,
      "u",
      "t",
    );
    expect(event.allDay).toBe(false);
  });

  it("sets nullable optional fields to null when absent", () => {
    const event = buildOptimisticEvent(BASE_REQUEST, "u", "t");
    expect(event.description).toBeNull();
    expect(event.location).toBeNull();
    expect(event.color).toBeNull();
    expect(event.categoryId).toBeNull();
    expect(event.reminder).toBeNull();
    expect(event.recurrence).toBeNull();
  });

  it("sets isRecurringInstance to false and parentEventId to null", () => {
    const event = buildOptimisticEvent(BASE_REQUEST, "u", "t");
    expect(event.isRecurringInstance).toBe(false);
    expect(event.parentEventId).toBeNull();
  });
});

describe("findCachedEvent", () => {
  it("returns the event from an overlapping events query", () => {
    const key = ["events", "2024-03-15T00:00:00", "2024-03-16T00:00:00"];
    const client = makeMockQueryClient({
      [key.join("|")]: makeEventResponse([EXISTING_EVENT]),
    });

    expect(findCachedEvent(client as never, "ev-existing")).toEqual(
      EXISTING_EVENT,
    );
  });

  it("returns undefined when the event is not cached", () => {
    const key = ["events", "2024-03-15T00:00:00", "2024-03-16T00:00:00"];
    const client = makeMockQueryClient({
      [key.join("|")]: makeEventResponse([EXISTING_EVENT]),
    });

    expect(findCachedEvent(client as never, "missing")).toBeUndefined();
  });
});

describe("optimisticallyInsertEvent", () => {
  it("inserts event into cache entries whose range overlaps the event", async () => {
    const key = ["events", "2024-03-15T00:00:00", "2024-03-16T00:00:00"];
    const client = makeMockQueryClient({
      [key.join("|")]: makeEventResponse([EXISTING_EVENT]),
    });

    const event = buildOptimisticEvent(BASE_REQUEST, "user-1", "temp-1");
    await optimisticallyInsertEvent(client as never, event);

    const stored = client._store[key.join("|")];
    expect(stored?.events.some((e) => e.id === "temp-1")).toBe(true);
    expect(stored?.events.length).toBe(2);
  });

  it("does NOT insert event into cache entries whose range does not overlap", async () => {
    const key = ["events", "2024-03-08T00:00:00", "2024-03-09T00:00:00"];
    const client = makeMockQueryClient({
      [key.join("|")]: makeEventResponse([]),
    });

    const event = buildOptimisticEvent(BASE_REQUEST, "user-1", "temp-2");
    await optimisticallyInsertEvent(client as never, event);

    const stored = client._store[key.join("|")];
    expect(stored?.events.length).toBe(0);
  });

  it("returns a snapshot of affected cache entries", async () => {
    const key = ["events", "2024-03-15T00:00:00", "2024-03-16T00:00:00"];
    const client = makeMockQueryClient({
      [key.join("|")]: makeEventResponse([EXISTING_EVENT]),
    });

    const event = buildOptimisticEvent(BASE_REQUEST, "user-1", "temp-3");
    const snapshot = await optimisticallyInsertEvent(client as never, event);

    expect(snapshot.length).toBe(1);
    expect(snapshot[0].data?.events).toContainEqual(EXISTING_EVENT);
  });

  it("calls cancelQueries to prevent in-flight overwrite", async () => {
    const client = makeMockQueryClient({});
    const event = buildOptimisticEvent(BASE_REQUEST, "u", "t");
    await optimisticallyInsertEvent(client as never, event);
    expect(client.cancelQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["events"] }),
    );
  });

  it("does not cancel a range that is still on its first load", async () => {
    const client = new QueryClient();
    const loaded = ["events", "2024-03-15T00:00:00.000Z", "2024-03-16T00:00:00.000Z"];
    const firstLoad = ["events", "2024-03-14T00:00:00.000Z", "2024-03-17T00:00:00.000Z"];
    client.setQueryData(loaded, makeEventResponse([]));
    let resolveFirstLoad: (value: EventsResponse) => void = () => undefined;
    const firstLoadFetch = client.fetchQuery({
      queryKey: firstLoad,
      queryFn: () =>
        new Promise<EventsResponse>((resolve) => {
          resolveFirstLoad = resolve;
        }),
    });

    await optimisticallyInsertEvent(
      client,
      buildOptimisticEvent(TIMED_REQUEST, "u", "temp-first-load"),
    );
    resolveFirstLoad(makeEventResponse([EXISTING_EVENT]));

    await expect(firstLoadFetch).resolves.toEqual(
      makeEventResponse([EXISTING_EVENT]),
    );
    expect(
      client.getQueryData<EventsResponse>(loaded)?.events.map((e) => e.id),
    ).toEqual(["temp-first-load"]);
  });
});

describe("commitOptimisticEvent", () => {
  const dayOne = ["events", "2024-03-15T00:00:00.000Z", "2024-03-16T00:00:00.000Z"];
  const dayTwo = ["events", "2024-03-16T00:00:00.000Z", "2024-03-17T00:00:00.000Z"];
  const lateNight: CalendarEvent = {
    ...EXISTING_EVENT,
    id: "ev-saved",
    start: new Date("2024-03-15T21:00:00.000Z"),
    end: new Date("2024-03-16T02:00:00.000Z"),
  };

  it("replaces the placeholder and fills ranges that reloaded without it", () => {
    const client = new QueryClient();
    const placeholder = { ...lateNight, id: "temp-1" };
    client.setQueryData(dayOne, makeEventResponse([placeholder, EXISTING_EVENT]));
    client.setQueryData(dayTwo, makeEventResponse([]));

    commitOptimisticEvent(client, "temp-1", lateNight);

    expect(
      client.getQueryData<EventsResponse>(dayOne)?.events.map((e) => e.id),
    ).toEqual(["ev-saved", "ev-existing"]);
    expect(
      client.getQueryData<EventsResponse>(dayTwo)?.events.map((e) => e.id),
    ).toEqual(["ev-saved"]);
  });

  it("leaves unrelated ranges untouched", () => {
    const client = new QueryClient();
    const other = ["events", "2024-04-01T00:00:00.000Z", "2024-04-02T00:00:00.000Z"];
    const data = makeEventResponse([EXISTING_EVENT]);
    client.setQueryData(other, data);

    commitOptimisticEvent(client, "temp-1", lateNight);

    expect(client.getQueryData(other)).toBe(data);
  });
});

describe("invalidateEventRanges", () => {
  const march = ["events", "2024-03-01T00:00:00.000Z", "2024-04-01T00:00:00.000Z"];
  const april = ["events", "2024-04-01T00:00:00.000Z", "2024-05-01T00:00:00.000Z"];
  const february = ["events", "2024-02-01T00:00:00.000Z", "2024-03-01T00:00:00.000Z"];
  const event = {
    start: new Date("2024-03-15T21:00:00.000Z"),
    end: new Date("2024-03-16T02:00:00.000Z"),
    recurrence: null,
  };

  function seed() {
    const client = new QueryClient();
    for (const key of [february, march, april]) {
      client.setQueryData(key, makeEventResponse([]));
    }
    return client;
  }

  const invalidated = (client: QueryClient) =>
    [february, march, april].map(
      (key) => client.getQueryState(key)?.isInvalidated ?? false,
    );

  it("only invalidates ranges the event overlaps", async () => {
    const client = seed();
    await invalidateEventRanges(client, event);
    expect(invalidated(client)).toEqual([false, true, false]);
  });

  it("invalidates every later range for a recurring event", async () => {
    const client = seed();
    await invalidateEventRanges(client, { ...event, recurrence: "{}" });
    expect(invalidated(client)).toEqual([false, true, true]);
  });
});

describe("readCachedEventsForRange", () => {
  const monthA = ["events", "2024-02-22T00:00:00.000Z", "2024-04-08T00:00:00.000Z"];
  const monthB = ["events", "2024-03-25T00:00:00.000Z", "2024-05-08T00:00:00.000Z"];
  const inRange: CalendarEvent = {
    ...EXISTING_EVENT,
    id: "ev-in",
    start: new Date("2024-04-02T09:00:00.000Z"),
    end: new Date("2024-04-02T10:00:00.000Z"),
  };
  const outOfRange: CalendarEvent = {
    ...EXISTING_EVENT,
    id: "ev-out",
    start: new Date("2024-03-01T09:00:00.000Z"),
    end: new Date("2024-03-01T10:00:00.000Z"),
  };

  it("merges overlapping loaded ranges that fully cover the request", () => {
    const client = new QueryClient();
    client.setQueryData(monthA, makeEventResponse([outOfRange, inRange]), {
      updatedAt: 1_000,
    });
    client.setQueryData(monthB, makeEventResponse([inRange]), {
      updatedAt: 2_000,
    });

    const seeded = readCachedEventsForRange(
      client,
      new Date("2024-03-28T00:00:00.000Z"),
      new Date("2024-04-20T00:00:00.000Z"),
    );

    expect(seeded?.data.events.map((e) => e.id)).toEqual(["ev-in"]);
    expect(seeded?.updatedAt).toBe(1_000);
  });

  it("returns undefined when loaded ranges leave a gap", () => {
    const client = new QueryClient();
    client.setQueryData(monthA, makeEventResponse([inRange]));

    expect(
      readCachedEventsForRange(
        client,
        new Date("2024-03-28T00:00:00.000Z"),
        new Date("2024-04-20T00:00:00.000Z"),
      ),
    ).toBeUndefined();
  });
});

describe("optimisticallyRemoveEvent", () => {
  it("removes the event with the given ID from all cache entries", async () => {
    const key = ["events", "2024-03-15T00:00:00", "2024-03-16T00:00:00"];
    const client = makeMockQueryClient({
      [key.join("|")]: makeEventResponse([EXISTING_EVENT]),
    });

    await optimisticallyRemoveEvent(client as never, "ev-existing");

    const stored = client._store[key.join("|")];
    expect(stored?.events.every((e) => e.id !== "ev-existing")).toBe(true);
    expect(stored?.events.length).toBe(0);
  });

  it("leaves other events intact", async () => {
    const other: CalendarEvent = { ...EXISTING_EVENT, id: "ev-other" };
    const key = ["events", "2024-03-15T00:00:00", "2024-03-16T00:00:00"];
    const client = makeMockQueryClient({
      [key.join("|")]: makeEventResponse([EXISTING_EVENT, other]),
    });

    await optimisticallyRemoveEvent(client as never, "ev-existing");

    const stored = client._store[key.join("|")];
    expect(stored?.events.length).toBe(1);
    expect(stored?.events[0].id).toBe("ev-other");
  });

  it("returns a snapshot containing the original data", async () => {
    const key = ["events", "2024-03-15T00:00:00", "2024-03-16T00:00:00"];
    const client = makeMockQueryClient({
      [key.join("|")]: makeEventResponse([EXISTING_EVENT]),
    });

    const snapshot = await optimisticallyRemoveEvent(
      client as never,
      "ev-existing",
    );

    expect(snapshot.length).toBe(1);
    expect(snapshot[0].data?.events).toContainEqual(EXISTING_EVENT);
  });
});

describe("optimisticallyPatchEvent", () => {
  it("updates start and end on the matching event", async () => {
    const key = ["events", "2024-03-15T00:00:00", "2024-03-16T00:00:00"];
    const client = makeMockQueryClient({
      [key.join("|")]: makeEventResponse([EXISTING_EVENT]),
    });
    const start = new Date("2024-03-15T11:00:00.000Z");
    const end = new Date("2024-03-15T12:00:00.000Z");

    await optimisticallyPatchEvent(client as never, "ev-existing", {
      start,
      end,
    });

    const stored = client._store[key.join("|")]?.events[0];
    expect(stored?.start).toEqual(start);
    expect(stored?.end).toEqual(end);
    expect(stored?.title).toBe("Existing");
  });

  it("leaves other events intact", async () => {
    const other: CalendarEvent = { ...EXISTING_EVENT, id: "ev-other" };
    const key = ["events", "2024-03-15T00:00:00", "2024-03-16T00:00:00"];
    const client = makeMockQueryClient({
      [key.join("|")]: makeEventResponse([EXISTING_EVENT, other]),
    });

    await optimisticallyPatchEvent(client as never, "ev-existing", {
      start: new Date("2024-03-15T14:00:00.000Z"),
      end: new Date("2024-03-15T15:00:00.000Z"),
    });

    const stored = client._store[key.join("|")];
    expect(stored?.events.find((event) => event.id === "ev-other")).toEqual(
      other,
    );
  });

  it("moves an event from the current week cache into the next week cache", async () => {
    const week1 = ["events", "2026-08-10T00:00:00.000Z", "2026-08-17T00:00:00.000Z"];
    const week2 = ["events", "2026-08-17T00:00:00.000Z", "2026-08-24T00:00:00.000Z"];
    const friday = {
      ...EXISTING_EVENT,
      start: new Date("2026-08-14T07:00:00.000Z"),
      end: new Date("2026-08-14T08:00:00.000Z"),
    };
    const client = makeMockQueryClient({
      [week1.join("|")]: makeEventResponse([friday]),
      [week2.join("|")]: makeEventResponse([]),
    });
    const start = new Date("2026-08-17T12:00:00.000Z");
    const end = new Date("2026-08-17T13:00:00.000Z");

    const snapshot = await optimisticallyPatchEvent(
      client as never,
      "ev-existing",
      { start, end },
    );

    expect(
      client._store[week1.join("|")]?.events.find(
        (event) => event.id === "ev-existing",
      ),
    ).toBeUndefined();
    expect(client._store[week2.join("|")]?.events).toEqual([
      { ...friday, start, end },
    ]);

    rollbackFromSnapshot(client as never, snapshot);
    expect(client._store[week1.join("|")]?.events).toEqual([friday]);
    expect(client._store[week2.join("|")]?.events).toEqual([]);
  });
});

describe("rollbackFromSnapshot", () => {
  it("restores cache entries to their snapshot state", async () => {
    const key = ["events", "2024-03-15T00:00:00", "2024-03-16T00:00:00"];
    const client = makeMockQueryClient({
      [key.join("|")]: makeEventResponse([EXISTING_EVENT]),
    });

    const snapshot = await optimisticallyRemoveEvent(
      client as never,
      "ev-existing",
    );
    expect(client._store[key.join("|")]?.events.length).toBe(0);

    rollbackFromSnapshot(client as never, snapshot);
    expect(client._store[key.join("|")]?.events).toContainEqual(EXISTING_EVENT);
  });

  it("is a no-op when given an empty snapshot", () => {
    const client = makeMockQueryClient({});
    expect(() => rollbackFromSnapshot(client as never, [])).not.toThrow();
    expect(client.setQueryData).not.toHaveBeenCalled();
  });

  it("restores multiple cache entries", async () => {
    const key1 = ["events", "2024-03-15T00:00:00", "2024-03-16T00:00:00"];
    const key2 = ["events", "2024-03-01T00:00:00", "2024-04-01T00:00:00"];
    const client = makeMockQueryClient({
      [key1.join("|")]: makeEventResponse([EXISTING_EVENT]),
      [key2.join("|")]: makeEventResponse([EXISTING_EVENT]),
    });

    const snapshot = await optimisticallyRemoveEvent(
      client as never,
      "ev-existing",
    );
    rollbackFromSnapshot(client as never, snapshot);

    expect(client._store[key1.join("|")]?.events).toContainEqual(
      EXISTING_EVENT,
    );
    expect(client._store[key2.join("|")]?.events).toContainEqual(
      EXISTING_EVENT,
    );
  });
});
