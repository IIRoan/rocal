import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    error: jest.fn(),
  }),
}));

import { StalwartCalendarClient } from "../../lib/stalwart-calendar";

function jsonResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response;
}

describe("StalwartCalendarClient", () => {
  let fetcher: jest.MockedFunction<
    (input: string, init?: RequestInit) => Promise<Response>
  >;
  let client: StalwartCalendarClient;

  beforeEach(() => {
    fetcher = jest.fn() as jest.MockedFunction<
      (input: string, init?: RequestInit) => Promise<Response>
    >;
    client = new StalwartCalendarClient({
      baseUrl: "https://mail.solace.test/",
      adminToken: "token-1",
      fetcher,
    });
  });

  it("creates calendars through Stalwart JMAP", async () => {
    fetcher.mockResolvedValueOnce(
      jsonResponse({
        methodResponses: [
          [
            "Calendar/set",
            {
              created: {
                calendar1: { id: "cal-1" },
              },
            },
            "c1",
          ],
        ],
      }),
    );

    await expect(
      client.createCalendar("acct-1", {
        name: "Personal",
        color: "#10b981",
        isVisible: true,
        isDefault: true,
      }),
    ).resolves.toEqual({ id: "cal-1" });

    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://mail.solace.test/jmap/");
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer token-1",
        "Content-Type": "application/json",
      }),
    );
    expect(body).toEqual({
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:calendars"],
      methodCalls: [
        [
          "Calendar/set",
          {
            accountId: "acct-1",
            create: {
              calendar1: {
                name: "Personal",
                color: "#10b981",
                isVisible: true,
                timeZone: null,
                description: null,
              },
            },
            onSuccessSetIsDefault: "#calendar1",
          },
          "c1",
        ],
      ],
    });
  });

  it("queries and fetches calendar events", async () => {
    fetcher
      .mockResolvedValueOnce(
        jsonResponse({
          methodResponses: [
            ["CalendarEvent/query", { ids: ["event-1"] }, "c1"],
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          methodResponses: [
            [
              "CalendarEvent/get",
              {
                list: [
                  {
                    id: "event-1",
                    title: "Planning",
                  },
                ],
              },
              "c1",
            ],
          ],
        }),
      );

    await expect(
      client.queryEventIds({
        accountId: "acct-1",
        filter: { inCalendar: "cal-1" },
      }),
    ).resolves.toEqual(["event-1"]);
    await expect(
      client.getEvents({ accountId: "acct-1", ids: ["event-1"] }),
    ).resolves.toEqual([{ id: "event-1", title: "Planning" }]);
  });

  it("surfaces Stalwart set errors", async () => {
    fetcher.mockResolvedValueOnce(
      jsonResponse({
        methodResponses: [
          [
            "CalendarEvent/set",
            {
              notCreated: {
                event1: {
                  type: "invalidProperties",
                  description: "Invalid calendarIds",
                },
              },
            },
            "c1",
          ],
        ],
      }),
    );

    await expect(
      client.createEvent({
        accountId: "acct-1",
        event: { title: "Planning" },
      }),
    ).rejects.toThrow("Invalid calendarIds");
  });
});
