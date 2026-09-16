import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { NoopE2eeProvider, type E2eeProvider } from "@workspace/e2ee";
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
    attachEventEncryptionShadow: async (request: Record<string, unknown>) => {
      const wire = { ...request, encryptedContent: "ciphertext" };
      delete wire.title;
      delete wire.description;
      delete wire.location;
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

    const body = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(JSON.parse(body)).toEqual({
      editScope: "this_only",
      occurrenceDate: "2026-06-01T09:00:00.000Z",
      updates: { encryptedContent: "ciphertext" },
    });
  });
});
