import { afterEach, expect, it, jest } from "@jest/globals";
import { NoopE2eeProvider } from "@workspace/e2ee";
import type { UserSettings } from "@workspace/calendar-core";
import { DEFAULT_RIFTBOUND_PREFERENCES } from "@workspace/calendar-core/riftbound-settings";
import { CalendarApiService } from "../calendar-api-service";
import { HttpClient } from "../http-client";

class Unlocked extends NoopE2eeProvider {
  async hasActiveSession() {
    return true;
  }
}
const store = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Fixture shop",
  address: "Venue",
};
const config = {
  ...DEFAULT_RIFTBOUND_PREFERENCES,
  enabled: true,
  registeredOnly: true,
  stores: [store],
  calendarId: "calendar",
  riotId: "Fixture User#EU",
};
const hash = "a".repeat(64);
const event = {
  id: "123",
  storeId: store.id,
  title: "Public event",
  start: "2026-10-30T18:00:00Z",
  location: "Venue",
  registeredRiotIdHashes: [hash],
};
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});
function setup(events: object[] = [event], recorded: string[] = []) {
  const fetcher = jest.fn(
    async () =>
      new Response(JSON.stringify(events), {
        headers: { "Content-Type": "application/json" },
      }),
  );
  globalThis.fetch = fetcher as typeof fetch;
  const api = new CalendarApiService(
    new HttpClient({ baseURL: "https://api.test", retries: 0 }),
    new Unlocked(),
  );
  const imported = jest
    .spyOn(api, "importICS")
    .mockResolvedValue({ success: true, eventsCreated: 1, eventsTotal: 1 });
  jest.spyOn(api, "getUserSettings").mockResolvedValue({
    timezone: "Europe/Amsterdam",
    riftboundImportedIds: recorded,
  } as UserSettings);
  const ledger = jest
    .spyOn(api, "updateUserSettings")
    .mockResolvedValue({} as UserSettings);
  return { api, fetcher, imported, ledger };
}

it("sends only store IDs to the API and imports matching events through the encrypted ICS path", async () => {
  const { api, fetcher, imported } = setup([
    event,
    { ...event, id: "456", registeredRiotIdHashes: [] },
  ]);
  const result = await api.syncRiftboundEvents(config, hash);
  expect(result.eventsCreated).toBe(1);
  const request = fetcher.mock.calls[0];
  expect(JSON.stringify(request)).not.toContain(config.riotId);
  expect(JSON.stringify(request)).not.toContain(hash);
  expect(imported.mock.calls[0]?.[0]).toMatchObject({
    calendarId: "calendar",
    timezone: "Europe/Amsterdam",
  });
  expect(imported.mock.calls[0]?.[2]).toBe(true);
  const ics = imported.mock.calls[0]?.[0].icsContent;
  expect(ics).toContain("UID:riftbound-123@playriftbound.com");
  expect(ics).not.toContain("riftbound-456");
  expect(ics).not.toContain(config.riotId);
});

it("imports registered events from yesterday rather than dropping past events", async () => {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  const { api, imported } = setup([{ ...event, start: yesterday }]);
  const result = await api.syncRiftboundEvents(config, hash);
  expect(result.events.map(({ start }) => start)).toEqual([yesterday]);
  expect(imported).toHaveBeenCalledTimes(1);
  expect(imported.mock.calls[0]?.[2]).toBe(true);
});

it("does not import an empty or unmatched roster, and can opt into all store events", async () => {
  const { api, imported } = setup([{ ...event, registeredRiotIdHashes: [] }]);
  expect((await api.syncRiftboundEvents(config, hash)).eventsCreated).toBe(0);
  expect(imported).not.toHaveBeenCalled();
  await api.syncRiftboundEvents({ ...config, registeredOnly: false }, "");
  expect(imported).toHaveBeenCalledTimes(1);
});

it("reports per-event import errors without losing the successfully created count", async () => {
  const { api, imported } = setup();
  imported.mockResolvedValueOnce({
    success: true,
    eventsCreated: 1,
    eventsTotal: 2,
    errors: ["fixture import failure"],
  });
  expect(await api.syncRiftboundEvents(config, hash)).toMatchObject({
    eventsCreated: 1,
    failedEvents: 1,
  });
});

it("does not read events or import when disabled, locked, or cancelled", async () => {
  const { api, fetcher, imported } = setup();
  await api.syncRiftboundEvents({ ...config, enabled: false }, hash);
  await expect(
    api.syncRiftboundEvents(config, hash, () => false),
  ).rejects.toThrow();
  api.setE2eeProvider(new NoopE2eeProvider());
  await expect(api.syncRiftboundEvents(config, hash)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  expect(imported).not.toHaveBeenCalled();
});

it("skips an invalid public event and still imports the valid ones", async () => {
  const { api, imported } = setup([{ ...event, id: "456", start: "invalid" }, event]);
  const result = await api.syncRiftboundEvents(config, hash);
  expect(result.events.map(({ id }) => id)).toEqual(["123"]);
  expect(imported.mock.calls[0]?.[0].icsContent).not.toContain("riftbound-456");
});

it("never re-imports a recorded event, so deleted or moved copies stay gone", async () => {
  const { api, imported, ledger } = setup([event], ["123"]);
  expect((await api.syncRiftboundEvents(config, hash)).eventsCreated).toBe(0);
  expect(imported).not.toHaveBeenCalled();
  expect(ledger).not.toHaveBeenCalled();
});

it("keeps the 200 most recently recorded IDs, oldest dropping first", async () => {
  const recorded = Array.from({ length: 200 }, (_, index) => String(index + 1000));
  const { api, ledger } = setup([event], recorded);
  await api.syncRiftboundEvents(config, hash);
  expect(ledger.mock.calls[0]?.[0]).toEqual({
    riftboundImportedIds: [...recorded.slice(1), "123"],
  });
});

it("records imported IDs only after a clean import", async () => {
  const { api, imported, ledger } = setup();
  await api.syncRiftboundEvents(config, hash);
  expect(ledger.mock.calls[0]?.[0]).toEqual({ riftboundImportedIds: ["123"] });
  ledger.mockClear();
  imported.mockResolvedValueOnce({
    success: true,
    eventsCreated: 0,
    eventsTotal: 1,
    errors: ["fixture import failure"],
  });
  await api.syncRiftboundEvents(config, hash);
  expect(ledger).not.toHaveBeenCalled();
});

it("cancels a settings write before any network request when its account scope expired", async () => {
  const { api, fetcher, ledger } = setup();
  ledger.mockRestore();
  await expect(
    api.updateUserSettings({ riftbound: config }, () => false),
  ).rejects.toBeDefined();
  expect(fetcher).not.toHaveBeenCalled();
});
