import { describe, expect, it, jest } from "@jest/globals";
import { Elysia } from "elysia";

jest.mock("../../lib/prisma", () => {
  const calendarRecord = {
    id: "cal-1",
    name: "Work",
    userId: "user-1",
    isSyncOnly: false,
    icsShareEnabled: false,
    icsShareToken: null,
  };

  return {
    prisma: {
      calendar: {
        findFirst: jest.fn(async (args: { where?: Record<string, unknown> }) => {
          if ("icsShareToken" in (args?.where ?? {})) {
            return null;
          }
          return calendarRecord;
        }),
        update: jest.fn(async (): Promise<any> => ({
          id: "cal-1",
          name: "Work",
          icsShareEnabled: true,
          icsShareToken: "token-abc",
        })),
      },
      calendarEvent: {
        count: jest.fn(async (): Promise<number> => 0),
      },
    },
  };
});

jest.mock("../../lib/auth", () => ({
  auth: { api: { getSession: jest.fn() } },
}));

jest.mock("../../lib/auth-guard", () => {
  const { createMockRequireAuth } =
    jest.requireActual<typeof import("../helpers/mock-require-auth")>(
      "../helpers/mock-require-auth",
    );
  return {
    requireAuth: createMockRequireAuth(),
  };
});

import { errorHandler } from "../../lib/errors";
import { calendarSharingRoutes } from "../../routes/calendar-sharing";

function createApp() {
  return new Elysia({ normalize: false })
    .use(errorHandler)
    .use(calendarSharingRoutes);
}

describe("calendarSharingRoutes", () => {
  it("accepts POST /calendars/:id/share-link without a JSON body", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/calendars/cal-1/share-link", {
        method: "POST",
      }),
    );

    expect(response.status).not.toBe(422);
    expect(response.status).toBe(200);
  });

  it("accepts POST /calendars/:id/share-link with regenerate=true", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/calendars/cal-1/share-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ regenerate: true }),
      }),
    );

    expect(response.status).toBe(200);
  });
});
