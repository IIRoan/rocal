import { describe, expect, it, jest } from "@jest/globals";
import { NoopE2eeProvider } from "@workspace/e2ee";
import { subscriptionUrlAad, UNBOUND_SUBSCRIPTION_URL_AAD } from "@workspace/calendar-core";

import { CalendarApiService } from "../calendar-api-service";
import { HttpClient } from "../http-client";

class UrlSealingProvider extends NoopE2eeProvider {
  bound = false;
  async hasActiveSession() {
    return true;
  }
  async refusesUnboundContent() {
    return this.bound;
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
    encryptedUrl: `${subscriptionUrlAad(id)}|${JSON.stringify({ url: `https://example.com/${id}.ics` })}`,
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
  const post = jest.spyOn(client, "post").mockImplementation(async (path: string, body?: unknown) =>
    (path === "/api/subscriptions"
      ? feed((body as { id: string }).id)
      : path === "/api/subscriptions/broken/sync"
        ? Promise.reject(new Error("feed down"))
        : { status: "success", eventsAdded: 2, eventsUpdated: 1, eventsDeleted: 1 }) as never,
  );
  const put = jest.spyOn(client, "put").mockResolvedValue(feed("s1") as never);
  const provider = new UrlSealingProvider();
  return { post, put, provider, service: new CalendarApiService(client, provider) };
}

describe("sealed feed URLs", () => {
  it("opens sealed URLs for the UI", async () => {
    const { service } = setup([feed("s1")]);

    const [subscription] = await service.getSubscriptions();

    expect(subscription?.url).toBe("https://example.com/s1.ics");
  });

  it("creates a feed under its own id with its URL sealed to it, and refuses one already in the decrypted list", async () => {
    const { post, service } = setup([feed("s1")]);

    const created = await service.createSubscription({ name: "Team", url: "https://example.com/team.ics" });

    const id = (post.mock.calls[0]?.[1] as { id: string }).id;
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(post).toHaveBeenCalledWith("/api/subscriptions", expect.objectContaining({
      id,
      url: "https://example.com/team.ics",
      encryptedUrl: `${subscriptionUrlAad(id)}|${JSON.stringify({ url: "https://example.com/team.ics" })}`,
    }));
    expect(created.url).toBe(`https://example.com/${id}.ics`);
    await expect(
      service.createSubscription({ name: "Again", url: " https://example.com/s1.ics " }),
    ).rejects.toMatchObject({ message: "You are already subscribed to this calendar URL" });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("seals a URL an update carries instead of sending it readable", async () => {
    const { put, service } = setup([]);

    await service.updateSubscription("s1", { url: "https://example.com/s1.ics" });

    expect(put).toHaveBeenCalledWith("/api/subscriptions/s1", {
      encryptedUrl: `${subscriptionUrlAad("s1")}|${JSON.stringify({ url: "https://example.com/s1.ics" })}`,
    });
  });

  it("never opens a URL sealed to another feed", async () => {
    const { service } = setup([feed("s2", { encryptedUrl: feed("s1").encryptedUrl })]);

    const [subscription] = await service.getSubscriptions();

    expect(subscription?.url).toBe("sealed:s2");
  });

  it("opens a URL sealed before binding and lists it for binding, until this device refuses unbound content", async () => {
    const legacy = feed("old", {
      encryptedUrl: `${UNBOUND_SUBSCRIPTION_URL_AAD}|${JSON.stringify({ url: "https://example.com/old.ics" })}`,
    });
    const { provider, service } = setup([legacy, feed("s1")]);

    expect((await service.getSubscriptions())[0]?.url).toBe("https://example.com/old.ics");
    await expect(service.getUnboundSubscriptionUrls()).resolves.toEqual([
      { id: "old", url: "https://example.com/old.ics" },
    ]);

    provider.bound = true;
    expect((await service.getSubscriptions())[0]?.url).toBe("sealed:old");
    await expect(service.getUnboundSubscriptionUrls()).resolves.toEqual([]);
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
