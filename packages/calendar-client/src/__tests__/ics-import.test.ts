import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { NoopE2eeProvider } from "@workspace/e2ee";
import type {
  CreateEventRequest,
  UpdateEventRequest,
} from "@workspace/calendar-core";
import { CalendarApiService } from "../calendar-api-service";
import { HttpClient } from "../http-client";

const icsContent =
  "BEGIN:VCALENDAR\nVERSION:2.0\nX-WR-CALNAME:Private calendar\nBEGIN:VEVENT\nUID:private@example.com\nDTSTART:20260601T090000Z\nDTEND:20260601T100000Z\nSUMMARY:Secret title\nDESCRIPTION:Secret notes\nLOCATION:Secret place\nEND:VEVENT\nEND:VCALENDAR";
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

class EncryptingProvider extends NoopE2eeProvider {
  async hasActiveSession() {
    return true;
  }
  async createBlindIndexTokens() {
    return ["opaque-import-id"];
  }
  async attachEventEncryptionShadow<
    T extends CreateEventRequest | UpdateEventRequest,
  >(request: T) {
    const { title, description, location, ...rest } = request;
    return {
      ...rest,
      encryptedContent: "ciphertext",
      blindIndexTokens: [],
      encryptionKeyVersion: 1,
      invitationContent: {
        title: title ?? "",
        description: description ?? "",
        location: location ?? "",
      },
    };
  }
}

describe("encrypted ICS import", () => {
  it("sends only encrypted event content and opaque identifiers", async () => {
    const fetcher = jest.fn(
      async () =>
        new Response(
          JSON.stringify({ success: true, eventsCreated: 1, eventsTotal: 1 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    globalThis.fetch = fetcher as typeof fetch;
    const client = new HttpClient({ baseURL: "https://api.test", retries: 0 });
    const post = jest.spyOn(client, "post");
    const service = new CalendarApiService(client, new EncryptingProvider());
    const result = await service.importICS({
      calendarId: "cal",
      icsContent,
      fileName: "private.ics",
      timezone: "UTC",
    });
    const payload = post.mock.calls[0]?.[1];
    expect(payload).toMatchObject({
      calendarId: "cal",
      encryptedEvents: [
        { externalId: "opaque-import-id", encryptedContent: "ciphertext" },
      ],
    });
    for (const secret of [
      "Secret",
      "private",
      "icsContent",
      "invitationContent",
    ])
      expect(JSON.stringify(payload)).not.toContain(secret);
    expect(result).toMatchObject({
      eventsCreated: 1,
      calendarName: "Private calendar",
      fileName: "private.ics",
    });
  });

  it("fails before uploading when the account key is unavailable", async () => {
    const fetcher = jest.fn<typeof fetch>();
    globalThis.fetch = fetcher;
    const service = new CalendarApiService(
      new HttpClient({ baseURL: "https://api.test", retries: 0 }),
    );
    await expect(
      service.importICS({ calendarId: "cal", icsContent }),
    ).rejects.toBeDefined();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
