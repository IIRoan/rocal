import {
  generateOptimisticId,
  buildOptimisticEvent,
  optimisticallyInsertEvent,
  optimisticallyRemoveEvent,
  rollbackFromSnapshot,
  type CacheSnapshot,
} from "./optimistic-events";
import type {
  CalendarEvent,
  CreateEventRequest,
  EventsResponse,
} from "@workspace/calendar-core";

// ─── Mock QueryClient ─────────────────────────────────────────────────────────

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

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_REQUEST: CreateEventRequest = {
  title: "Team meeting",
  start: "2024-03-15T09:00:00",
  end: "2024-03-15T10:00:00",
  calendarId: "cal-1",
  allDay: false,
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

// ─── generateOptimisticId ─────────────────────────────────────────────────────

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

// ─── buildOptimisticEvent ─────────────────────────────────────────────────────

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

// ─── optimisticallyInsertEvent ────────────────────────────────────────────────

describe("optimisticallyInsertEvent", () => {
  it("inserts event into cache entries whose range overlaps the event", async () => {
    // Range covers 2024-03-15 all day
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
    // Range is a week earlier
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
    expect(client.cancelQueries).toHaveBeenCalledWith({ queryKey: ["events"] });
  });
});

// ─── optimisticallyRemoveEvent ────────────────────────────────────────────────

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

// ─── rollbackFromSnapshot ─────────────────────────────────────────────────────

describe("rollbackFromSnapshot", () => {
  it("restores cache entries to their snapshot state", async () => {
    const key = ["events", "2024-03-15T00:00:00", "2024-03-16T00:00:00"];
    const client = makeMockQueryClient({
      [key.join("|")]: makeEventResponse([EXISTING_EVENT]),
    });

    // Optimistically remove so cache is now empty
    const snapshot = await optimisticallyRemoveEvent(
      client as never,
      "ev-existing",
    );
    expect(client._store[key.join("|")]?.events.length).toBe(0);

    // Roll back — original event should be restored
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
