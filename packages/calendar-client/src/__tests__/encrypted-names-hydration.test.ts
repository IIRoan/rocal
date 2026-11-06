import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { ENCRYPTION_NOT_READY_MESSAGE, NoopE2eeProvider, type E2eeProvider } from "@workspace/e2ee";
import type { Calendar, EventCategory } from "@workspace/calendar-core";

import { CalendarApiService } from "../calendar-api-service";
import { HttpClient } from "../http-client";

function jsonOk(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function decryptingProvider(): E2eeProvider {
  const decryptName = async <T extends Calendar | EventCategory>(row: T) =>
    row.encryptedName ? { ...row, name: `plain:${row.encryptedName}` } : row;

  return Object.assign(new NoopE2eeProvider(), {
    hydrateEncryptedCalendar: decryptName,
    hydrateEncryptedCategory: decryptName,
    attachCalendarEncryptionShadow: async ({ name, ...rest }: { name?: string }) =>
      name ? { ...rest, encryptedName: `sealed:${name}`, encryptionKeyVersion: 1 } : rest,
    attachEventEncryptionShadow: async (request: Record<string, unknown>) => {
      const wire = { ...request, encryptedContent: "ciphertext" };
      for (const field of ["title", "description", "location", "color", "categoryId"]) {
        delete wire[field];
      }
      return wire;
    },
  }) as E2eeProvider;
}

describe("CalendarApiService encrypted names", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function createService(e2ee: E2eeProvider) {
    return new CalendarApiService(
      new HttpClient({ baseURL: "http://api.test", retries: 0 }),
      e2ee,
    );
  }

  it("decrypts calendar names and strips ciphertext from the UI model", async () => {
    globalThis.fetch = jest.fn(async () =>
      jsonOk({
        calendars: [
          { id: "c1", name: "", encryptedName: "Therapy", kind: "owned" },
          { id: "c2", name: "Holidays", encryptedName: null, kind: "subscribed" },
        ],
      }),
    ) as typeof fetch;

    const calendars = await createService(decryptingProvider()).getCalendars();

    expect(calendars).toEqual([
      expect.objectContaining({
        id: "c1",
        name: "plain:Therapy",
        encryptedName: null,
        encryptionState: "encrypted",
      }),
      expect.objectContaining({
        id: "c2",
        name: "Holidays",
        encryptionState: "plaintext",
      }),
    ]);
  });

  it("shows a placeholder when this device cannot decrypt a name", async () => {
    globalThis.fetch = jest.fn(async () =>
      jsonOk({ categories: [{ id: "k1", name: "", encryptedName: "x" }] }),
    ) as typeof fetch;

    const categories = await createService(
      new NoopE2eeProvider(),
    ).getCategories();

    expect(categories[0]).toMatchObject({ name: "Encrypted category" });
  });

  it("hydrates calendar relations on events", async () => {
    globalThis.fetch = jest.fn(async () =>
      jsonOk({
        id: "e1",
        title: "Standup",
        start: "2026-06-01T09:00:00.000Z",
        end: "2026-06-01T09:30:00.000Z",
        calendar: { id: "c1", name: "", encryptedName: "Work" },
      }),
    ) as typeof fetch;

    const event = await createService(decryptingProvider()).getEvent("e1");

    expect(event.calendar).toMatchObject({ name: "plain:Work" });
  });

  it("sends recurring content edits as ciphertext only", async () => {
    const fetchMock = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonOk({
          id: "e1",
          title: "",
          start: "2026-06-01T09:00:00.000Z",
          end: "2026-06-01T09:30:00.000Z",
        }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await createService(decryptingProvider()).editRecurringEvent("e1", {
      editScope: "this_only",
      occurrenceDate: "2026-06-01T09:00:00.000Z",
      updates: { title: "Therapy", location: "Clinic" },
    });

    const body = String(fetchMock.mock.calls.at(-1)?.[1]?.body);
    expect(JSON.parse(body)).toEqual({
      editScope: "this_only",
      occurrenceDate: "2026-06-01T09:00:00.000Z",
      updates: { encryptedContent: "ciphertext" },
    });
  });

  it("encrypts the stored content beside the fields an update changes", async () => {
    const fetchMock = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonOk({
          id: "e1",
          title: "Standup",
          description: "Notes",
          color: "teal",
          categoryId: "k1",
          start: "2026-06-01T09:00:00.000Z",
          end: "2026-06-01T09:30:00.000Z",
        }),
    );
    globalThis.fetch = fetchMock as typeof fetch;
    const provider = decryptingProvider();
    const attach = jest.spyOn(provider, "attachEventEncryptionShadow");
    const service = createService(provider);

    await service.updateEvent("e1", { color: "rose" });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("http://api.test/api/events/e1");
    expect(fetchMock.mock.calls[0]?.[1]?.method ?? "GET").toBe("GET");
    expect(attach).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: "Standup",
        description: "Notes",
        color: "rose",
        categoryId: "k1",
      }),
    );

    fetchMock.mockClear();
    await service.updateEvent("e1", { start: "2026-06-01T10:00:00.000Z" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends a feed name only sealed and opens it from the mirrored calendar", async () => {
    const feed = {
      id: "s1",
      name: "",
      url: "https://feeds.test/a.ics",
      calendar: { id: "c1", name: "", encryptedName: "Therapy practice", kind: "subscribed" },
    };
    const fetchMock = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        jsonOk(init?.method === "GET" || !init?.method ? [feed] : feed),
    );
    globalThis.fetch = fetchMock as typeof fetch;
    const service = createService(decryptingProvider());

    const created = await service.createSubscription({
      name: "Therapy practice",
      url: "https://feeds.test/a.ics",
      color: "blue",
    });
    await service.updateSubscription("s1", { name: "Clinic", isActive: false });
    const [listed] = await service.getSubscriptions();

    const bodies = fetchMock.mock.calls.map(([, init]) => init?.body && JSON.parse(String(init.body)));
    expect(bodies.slice(0, 2)).toEqual([
      { url: "https://feeds.test/a.ics", color: "blue", encryptedName: "sealed:Therapy practice", encryptionKeyVersion: 1 },
      { isActive: false, encryptedName: "sealed:Clinic", encryptionKeyVersion: 1 },
    ]);
    for (const subscription of [created, listed]) {
      expect(subscription).toMatchObject({
        name: "plain:Therapy practice",
        calendar: { name: "plain:Therapy practice", encryptedName: null },
      });
    }
  });

  it("refuses to send a feed name readable without a session", async () => {
    const fetchMock = jest.fn(async () => jsonOk({}));
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(
      createService(new NoopE2eeProvider()).createSubscription({
        name: "Therapy practice",
        url: "https://feeds.test/a.ics",
      }),
    ).rejects.toMatchObject({ message: ENCRYPTION_NOT_READY_MESSAGE });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("counts category usage from every corpus page on this device", async () => {
    const event = (id: string, categoryId: string | null) => ({
      id,
      title: "Event",
      categoryId,
      start: "2026-06-01T09:00:00.000Z",
      end: "2026-06-01T09:30:00.000Z",
    });
    const pages = [
      { events: [event("e1", "k1"), event("e2", null)], total: 3, nextOffset: 2 },
      { events: [event("e3", "k1")], total: 3, nextOffset: null },
    ];
    globalThis.fetch = jest.fn(async () => jsonOk(pages.shift())) as typeof fetch;

    await expect(
      createService(decryptingProvider()).getCategoryUsageCounts(),
    ).resolves.toEqual({ k1: 2 });
  });
});
