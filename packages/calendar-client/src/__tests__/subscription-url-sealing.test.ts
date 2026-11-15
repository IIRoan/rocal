import { describe, expect, it, jest } from "@jest/globals";
import { NoopE2eeProvider } from "@workspace/e2ee";
import { SUBSCRIPTION_URL_AAD } from "@workspace/calendar-core";

import { CalendarApiService } from "../calendar-api-service";
import { HttpClient } from "../http-client";

class UrlSealingProvider extends NoopE2eeProvider {
  async hasActiveSession() {
    return true;
  }
  async attachCalendarEncryptionShadow<T>(request: T) {
    return { encryptedName: "sealed-name", encryptionKeyVersion: 1, ...request, name: undefined } as never;
  }
  async encryptJson(value: unknown, aad: string) {
    return `${aad}|${JSON.stringify(value)}`;
  }
  async decryptJson(encrypted: string, aad: string) {
    const [sealedAad, json] = encrypted.split("|");
    if (sealedAad !== aad || !json) throw new Error("does not open");
    return JSON.parse(json) as unknown;
  }
}

const now = Date.parse("2026-11-14T12:00:00.000Z");

function feed(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: "",
    url: `sealed:${id}`,
    encryptedUrl: `${SUBSCRIPTION_URL_AAD}|${JSON.stringify({ url: `https://example.com/${id}.ics` })}`,
    isActive: true,
    syncIntervalMinutes: 15,
    lastSyncAt: "2026-11-14T11:00:00.000Z",
    lastSyncStatus: "success",
    calendar: { id: `cal-${id}`, name: "", encryptedName: null, kind: "subscribed" },
    ...overrides,
  };
}

function setup(subscriptions: ReturnType<typeof feed>[]) {
  const client = new HttpClient({ baseURL: "https://api.test", retries: 0 });
  jest.spyOn(client, "get").mockResolvedValue(subscriptions as never);
  const post = jest.spyOn(client, "post").mockImplementation(async (path: string) =>
    (path === "/api/subscriptions"
      ? feed("new")
      : path === "/api/subscriptions/broken/sync"
        ? Promise.reject(new Error("feed down"))
        : { status: "success", eventsAdded: 2, eventsUpdated: 1, eventsDeleted: 1 }) as never,
  );
  const put = jest.spyOn(client, "put").mockResolvedValue(feed("s1") as never);
  return { post, put, service: new CalendarApiService(client, new UrlSealingProvider()) };
}

describe("sealed feed URLs", () => {
  it("opens sealed URLs for the UI", async () => {
    const { service } = setup([feed("s1")]);

    const [subscription] = await service.getSubscriptions();

    expect(subscription?.url).toBe("https://example.com/s1.ics");
  });

  it("creates a feed with its URL sealed, and refuses one already in the decrypted list", async () => {
    const { post, service } = setup([feed("s1")]);

    await service.createSubscription({ name: "Team", url: "https://example.com/team.ics" });

    expect(post).toHaveBeenCalledWith("/api/subscriptions", expect.objectContaining({
      url: "https://example.com/team.ics",
      encryptedUrl: `${SUBSCRIPTION_URL_AAD}|${JSON.stringify({ url: "https://example.com/team.ics" })}`,
    }));
    await expect(
      service.createSubscription({ name: "Again", url: " https://example.com/s1.ics " }),
    ).rejects.toMatchObject({ message: "You are already subscribed to this calendar URL" });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("seals a URL an update carries instead of sending it readable", async () => {
    const { put, service } = setup([]);

    await service.updateSubscription("s1", { url: "https://example.com/s1.ics" });

    expect(put).toHaveBeenCalledWith("/api/subscriptions/s1", {
      encryptedUrl: `${SUBSCRIPTION_URL_AAD}|${JSON.stringify({ url: "https://example.com/s1.ics" })}`,
    });
  });

  it("syncs only due sealed feeds, each with its decrypted URL", async () => {
    const { post, service } = setup([
      feed("due"),
      feed("recent", { lastSyncAt: "2026-11-14T11:55:00.000Z" }),
      feed("weekly", { syncIntervalMinutes: 10080 }),
      feed("paused", { isActive: false }),
      feed("readable", { url: "https://example.com/readable.ics", encryptedUrl: null }),
    ]);

    await expect(service.syncDueSubscriptions(now)).resolves.toEqual({ attempted: 1, changed: 4 });

    expect(post.mock.calls).toEqual([
      ["/api/subscriptions/due/sync", { url: "https://example.com/due.ics" }],
    ]);
  });

  it("counts a failed feed as tried without changes and keeps syncing the rest", async () => {
    const { post, service } = setup([feed("broken"), feed("due")]);

    await expect(service.syncDueSubscriptions(now)).resolves.toEqual({ attempted: 2, changed: 4 });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("never syncs a URL that does not open on this device", async () => {
    const { post, service } = setup([feed("other-key", { encryptedUrl: "elsewhere|{}" })]);

    const [subscription] = await service.getSubscriptions();
    await expect(service.syncDueSubscriptions(now)).resolves.toEqual({ attempted: 0, changed: 0 });

    expect(subscription?.url).toBe("sealed:other-key");
    expect(post).not.toHaveBeenCalled();
  });
});
