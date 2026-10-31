import { createHash } from "node:crypto";
import {
  DEFAULT_RIFTBOUND_PREFERENCES,
  normalizeRiftboundRiotId,
  riftboundDurationOptions,
  riftboundPreferencesSchema,
  riftboundQueryAffected,
  selectRiftboundEvents,
} from "../riftbound-settings";

const store = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Fixture shop",
  address: "Public venue",
};
const config = {
  ...DEFAULT_RIFTBOUND_PREFERENCES,
  enabled: true,
  registeredOnly: true,
  riotId: "Fixture User#EU",
  stores: [store],
  calendarId: "calendar",
};
const hash = createHash("sha256")
  .update(normalizeRiftboundRiotId(config.riotId))
  .digest("hex");
const event = {
  id: "123",
  storeId: store.id,
  title: "Nexus Night",
  start: "2026-10-30T18:00:00Z",
  location: "Public venue",
  registeredRiotIdHashes: [hash],
};

it("matches a complete Riot ID case-insensitively without silently removing spaces", () => {
  expect(normalizeRiftboundRiotId("  Fixture User#eu ")).toBe(
    "fixture user#eu",
  );
  expect(normalizeRiftboundRiotId("FixtureUser#EU")).not.toBe(
    normalizeRiftboundRiotId(config.riotId),
  );
  expect(normalizeRiftboundRiotId("Ｆixture User#ＥＵ")).toBe(
    "fixture user#eu",
  );
});

it("requires store, destination, and Riot ID when enabling registration matching", () => {
  expect(
    riftboundPreferencesSchema.safeParse(DEFAULT_RIFTBOUND_PREFERENCES).success,
  ).toBe(true);
  expect(
    riftboundPreferencesSchema.safeParse({
      ...DEFAULT_RIFTBOUND_PREFERENCES,
      enabled: true,
    }).success,
  ).toBe(false);
  expect(riftboundPreferencesSchema.safeParse(config).success).toBe(true);
  expect(
    riftboundPreferencesSchema.safeParse({
      ...config,
      riotId: "",
      registeredOnly: false,
    }).success,
  ).toBe(true);
});

it("imports a member's event, not nonmembers or events from an unselected store", () => {
  expect(
    selectRiftboundEvents(
      [
        event,
        { ...event, id: "456", registeredRiotIdHashes: [] },
        {
          ...event,
          id: "789",
          storeId: "00000000-0000-4000-8000-000000000002",
        },
      ],
      config,
      hash,
    ),
  ).toEqual([event]);
});

it("all-store-events mode includes nonmembers but still excludes other stores", () => {
  const events = [event, { ...event, id: "456", registeredRiotIdHashes: [] }];
  expect(
    selectRiftboundEvents(events, { ...config, registeredOnly: false }, ""),
  ).toEqual(events);
});

it("defaults to all store events, since imported times can identify a registered player", () => {
  expect(DEFAULT_RIFTBOUND_PREFERENCES.registeredOnly).toBe(false);
});

it("rejects oversized store lists, duplicate stores, and store text too long for sealed settings", () => {
  expect(
    riftboundPreferencesSchema.safeParse({ ...config, stores: [store, store] })
      .success,
  ).toBe(false);
  expect(
    riftboundPreferencesSchema.safeParse({
      ...config,
      stores: Array(11).fill(store),
    }).success,
  ).toBe(false);
  expect(
    riftboundPreferencesSchema.safeParse({
      ...config,
      stores: [{ ...store, address: "a".repeat(201) }],
    }).success,
  ).toBe(false);
});

it("drops malformed records one by one instead of failing the whole sync", () => {
  expect(
    selectRiftboundEvents(
      [
        { ...event, id: "1", registeredRiotIdHashes: [hash, "not-a-hash"] },
        { ...event, id: "2", start: "invalid" },
        { ...event, id: "3", title: "Line\nbreak" },
        event,
      ],
      config,
      hash,
    ),
  ).toEqual([event]);
});

it("invalidates affected month grids and native ranges, never unrelated queries", () => {
  expect(riftboundQueryAffected(["events", "2026-10"], [event], 240)).toBe(
    true,
  );
  expect(riftboundQueryAffected(["events", "2026-09"], [event], 240)).toBe(
    true,
  );
  expect(riftboundQueryAffected(["events", "2026-12"], [event], 240)).toBe(
    false,
  );
  expect(
    riftboundQueryAffected(
      ["events", "2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z"],
      [event],
      240,
    ),
  ).toBe(true);
  expect(
    riftboundQueryAffected(
      ["events", "2026-09-01T00:00:00Z", "2026-09-30T00:00:00Z"],
      [event],
      240,
    ),
  ).toBe(false);
  expect(riftboundQueryAffected(["mail"], [event], 240)).toBe(false);
});

it("offers preset event lengths and keeps a saved custom length selectable", () => {
  expect(riftboundDurationOptions(240).map(({ label }) => label)).toEqual([
    "2 hours",
    "3 hours",
    "4 hours",
    "6 hours",
    "8 hours",
  ]);
  expect(riftboundDurationOptions(90).map(({ value }) => value)).toEqual([
    90, 120, 180, 240, 360, 480,
  ]);
});
