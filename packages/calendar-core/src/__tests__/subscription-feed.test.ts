import { describe, expect, it } from "@jest/globals";

import { feedSyncUrl, isFeedSyncDue } from "../subscription-feed";

const now = Date.parse("2026-11-14T12:00:00.000Z");
const feed = (overrides: Partial<Parameters<typeof isFeedSyncDue>[0]> = {}) => ({
  url: "https://example.com/private.ics",
  encryptedUrl: "sealed-url",
  isActive: true,
  lastSyncAt: "2026-11-14T11:40:00.000Z",
  syncIntervalMinutes: 15,
  ...overrides,
});

describe("isFeedSyncDue", () => {
  it("is due once the feed's own interval has passed, or when it never synced", () => {
    expect(isFeedSyncDue(feed(), now)).toBe(true);
    expect(isFeedSyncDue(feed({ lastSyncAt: "2026-11-14T11:50:00.000Z" }), now)).toBe(false);
    expect(isFeedSyncDue(feed({ lastSyncAt: null }), now)).toBe(true);
    expect(isFeedSyncDue(feed({ syncIntervalMinutes: 10080, lastSyncAt: "2026-11-10T12:00:00.000Z" }), now)).toBe(false);
  });

  it("leaves paused, readable and unopened feeds alone", () => {
    expect(isFeedSyncDue(feed({ isActive: false }), now)).toBe(false);
    expect(isFeedSyncDue(feed({ encryptedUrl: null }), now)).toBe(false);
    expect(isFeedSyncDue(feed({ url: "sealed:feed-1" }), now)).toBe(false);
  });
});

describe("feedSyncUrl", () => {
  it("sends only a sealed feed's URL that opened on this device", () => {
    expect(feedSyncUrl(feed())).toBe("https://example.com/private.ics");
    expect(feedSyncUrl(feed({ encryptedUrl: null }))).toBeUndefined();
    expect(feedSyncUrl(feed({ url: "sealed:feed-1" }))).toBeUndefined();
  });
});
