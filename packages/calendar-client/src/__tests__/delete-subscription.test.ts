import { afterEach, describe, expect, it, jest } from "@jest/globals";

import { CalendarApiService } from "../calendar-api-service";
import { HttpClient } from "../http-client";

describe("CalendarApiService.deleteSubscription", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("removes the feed's events with it, so no writable calendar keeps plaintext", async () => {
    const fetchMock = jest.fn(async (_input: RequestInfo | URL) =>
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await new CalendarApiService(
      new HttpClient({ baseURL: "http://api.test", retries: 0 }),
    ).deleteSubscription("feed-1");

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://api.test/api/subscriptions/feed-1?deleteEvents=true",
    );
  });
});
