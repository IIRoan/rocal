import { afterEach, describe, expect, it, jest } from "@jest/globals";

import { CalendarApiService } from "../calendar-api-service";
import { HttpClient } from "../http-client";

function jsonOk(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("CalendarApiService.respondToInvitation", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function createService() {
    return new CalendarApiService(
      new HttpClient({
        baseURL: "http://api.test",
        retries: 0,
      }),
    );
  }

  it("POSTs the RSVP status to /api/events/:id/rsvp", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://api.test/api/events/evt-1/rsvp");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ status: "accepted" });
      return jsonOk({
        id: "evt-1",
        title: "Standup",
        start: "2026-08-24T09:00:00.000Z",
        end: "2026-08-24T09:30:00.000Z",
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await createService().respondToInvitation("evt-1", "accepted");
    expect("deleted" in result).toBe(false);
    expect(result).toMatchObject({ id: "evt-1", title: "Standup" });
    expect((result as { start: Date }).start).toBeInstanceOf(Date);
  });

  it("returns { deleted: true } when declining removes the event", async () => {
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ status: "declined" });
      return jsonOk({ deleted: true });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(
      createService().respondToInvitation("evt-1", "declined"),
    ).resolves.toEqual({ deleted: true });
  });

  it("wraps API failures with the invitation error", async () => {
    globalThis.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ message: "Not an attendee" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof fetch;

    await expect(
      createService().respondToInvitation("evt-1", "tentative"),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/invitation|Not an attendee/i),
      statusCode: 403,
    });
  });
});
