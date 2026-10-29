import { afterEach, describe, expect, it, jest } from "@jest/globals";

import { CalendarApiService } from "../calendar-api-service";
import { HttpClient } from "../http-client";

describe("CalendarApiService path ids", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  async function requestedUrl(id: string): Promise<string> {
    const fetchMock = jest.fn(async (_input: RequestInfo | URL) =>
      new Response(JSON.stringify({ id, title: "", start: "2026-11-03T09:00:00.000Z", end: "2026-11-03T10:00:00.000Z" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;
    await new CalendarApiService(new HttpClient({ baseURL: "http://api.test", retries: 0 })).getEvent(id);
    return String(fetchMock.mock.calls[0]?.[0]);
  }

  it("keeps an id from a mail link or deep link inside its own path segment", async () => {
    await expect(requestedUrl("../mail/keys/a@b.test")).resolves.toBe(
      "http://api.test/api/events/..%2Fmail%2Fkeys%2Fa%40b.test",
    );
  });

  it("keeps a client-chosen device id inside its own path segment", async () => {
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ success: true, message: "Encryption device removed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;
    await new CalendarApiService(new HttpClient({ baseURL: "http://api.test", retries: 0 })).deleteE2eeDevice("web/a b");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("http://api.test/api/e2ee/devices/web%2Fa%20b");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("DELETE");
  });

  it("sends generated occurrence ids intact", async () => {
    await expect(requestedUrl("ser1_2026-11-03T09:00:00.000Z")).resolves.toBe(
      "http://api.test/api/events/ser1_2026-11-03T09%3A00%3A00.000Z",
    );
  });
});
