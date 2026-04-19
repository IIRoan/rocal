import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import { Elysia } from "elysia";

jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    ok: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    skip: jest.fn(),
    step: jest.fn(),
    child: jest.fn(),
  }),
}));

jest.mock("@workspace/calendar-ics", () => ({
  findNationalHolidayCalendarByUrl: jest.fn(() => null),
}));

jest.mock("../../lib/ics-parser", () => ({
  parseICSFile: jest.fn(),
  convertParsedEventToCalendarEvent: jest.fn(),
  isEventModified: jest.fn(),
}));

const mockTransaction = jest.fn();

jest.mock("../../lib/prisma", () => ({
  prisma: {
    calendarSubscription: {
      findMany: jest.fn(async (): Promise<any> => []),
      findFirst: jest.fn(async (): Promise<any> => null),
      create: jest.fn(async (): Promise<any> => null),
      update: jest.fn(async (): Promise<any> => null),
      delete: jest.fn(async (): Promise<any> => null),
    },
    calendar: {
      findFirst: jest.fn(async (): Promise<any> => null),
      create: jest.fn(async (): Promise<any> => null),
      update: jest.fn(async (): Promise<any> => null),
      delete: jest.fn(async (): Promise<any> => null),
    },
    calendarEvent: {
      deleteMany: jest.fn(async (): Promise<any> => ({ count: 0 })),
    },
    calendarSubscriptionSyncLog: {
      deleteMany: jest.fn(async (): Promise<any> => ({ count: 0 })),
    },
    get $transaction() {
      return mockTransaction;
    },
  },
}));

jest.mock("../../lib/auth-utils", () => ({
  ensureAuthenticatedUser: jest.fn(async (): Promise<any> => ({
    id: "user-1",
  })),
}));

jest.mock("../../lib/auth", () => ({
  auth: { api: { getSession: jest.fn() } },
}));

jest.mock("../../lib/auth-guard", () => {
  const { Elysia: LocalElysia } =
    jest.requireActual<typeof import("elysia")>("elysia");
  return {
    requireAuth: new LocalElysia({ name: "require-auth-test" }),
  };
});

import { errorHandler } from "../../lib/errors";
import { ensureAuthenticatedUser } from "../../lib/auth-utils";
import { prisma } from "../../lib/prisma";
import { subscriptionsRoute } from "../../routes/subscriptions";
import { ALLOWED_CALENDAR_COLORS } from "../../lib/colors";

const mockEnsureAuthenticatedUser =
  ensureAuthenticatedUser as jest.MockedFunction<typeof ensureAuthenticatedUser>;
const mockPrisma = prisma as unknown as {
  calendarSubscription: {
    findMany: jest.Mock<() => Promise<any>>;
    findFirst: jest.Mock<() => Promise<any>>;
    create: jest.Mock<() => Promise<any>>;
    update: jest.Mock<() => Promise<any>>;
    delete: jest.Mock<() => Promise<any>>;
  };
  calendar: {
    findFirst: jest.Mock<() => Promise<any>>;
    create: jest.Mock<() => Promise<any>>;
    update: jest.Mock<() => Promise<any>>;
    delete: jest.Mock<() => Promise<any>>;
  };
  calendarEvent: {
    deleteMany: jest.Mock<() => Promise<any>>;
  };
  calendarSubscriptionSyncLog: {
    deleteMany: jest.Mock<() => Promise<any>>;
  };
  $transaction: jest.Mock;
};

function createApp() {
  return new Elysia({ normalize: false })
    .use(errorHandler)
    .use(subscriptionsRoute);
}

async function readText(response: Response) {
  return response.text();
}

describe("subscriptionsRoute – color validation", () => {
  const existingSubscription = {
    id: "sub-1",
    name: "Holidays",
    url: "https://example.com/cal.ics",
    calendarId: "cal-1",
    userId: "user-1",
    isActive: true,
    syncIntervalMinutes: 15,
    calendar: {
      id: "cal-1",
      name: "Holidays",
      color: "blue",
      kind: "subscribed",
      userId: "user-1",
    },
  };

  beforeEach(() => {
    mockEnsureAuthenticatedUser.mockResolvedValue({ id: "user-1" });
  });

  describe("PUT /subscriptions/:id – update", () => {
    it.each(ALLOWED_CALENDAR_COLORS)(
      "accepts named color '%s'",
      async (color) => {
        mockPrisma.calendarSubscription.findFirst.mockResolvedValue(
          existingSubscription,
        );
        const updatedSub = {
          ...existingSubscription,
          calendar: { ...existingSubscription.calendar, color },
        };
        mockTransaction.mockImplementation(async (fn: any) => {
          const tx = {
            calendar: {
              update: jest.fn(async () => ({
                ...existingSubscription.calendar,
                color,
              })),
            },
            calendarSubscription: {
              update: jest.fn(async () => updatedSub),
            },
          };
          return fn(tx);
        });

        const response = await createApp().handle(
          new Request("http://localhost/subscriptions/sub-1", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ color }),
          }),
        );

        expect(response.status).toBe(200);
      },
    );

    it("accepts valid hex color", async () => {
      mockPrisma.calendarSubscription.findFirst.mockResolvedValue(
        existingSubscription,
      );
      const updatedSub = {
        ...existingSubscription,
        calendar: { ...existingSubscription.calendar, color: "#FF5733" },
      };
      mockTransaction.mockImplementation(async (fn: any) => {
        const tx = {
          calendar: {
            update: jest.fn(async () => ({
              ...existingSubscription.calendar,
              color: "#FF5733",
            })),
          },
          calendarSubscription: {
            update: jest.fn(async () => updatedSub),
          },
        };
        return fn(tx);
      });

      const response = await createApp().handle(
        new Request("http://localhost/subscriptions/sub-1", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ color: "#FF5733" }),
        }),
      );

      expect(response.status).toBe(200);
    });

    it("accepts valid 3-digit hex color", async () => {
      mockPrisma.calendarSubscription.findFirst.mockResolvedValue(
        existingSubscription,
      );
      mockTransaction.mockImplementation(async (fn: any) => {
        const tx = {
          calendar: { update: jest.fn(async () => ({})) },
          calendarSubscription: {
            update: jest.fn(async () => ({
              ...existingSubscription,
              calendar: { ...existingSubscription.calendar, color: "#abc" },
            })),
          },
        };
        return fn(tx);
      });

      const response = await createApp().handle(
        new Request("http://localhost/subscriptions/sub-1", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ color: "#abc" }),
        }),
      );

      expect(response.status).toBe(200);
    });

    it.each(["chartreuse", "BLUE", "navy", "#GGG", "#12345", "rgb(0,0,0)"])(
      "rejects invalid color '%s'",
      async (color) => {
        mockPrisma.calendarSubscription.findFirst.mockResolvedValue(
          existingSubscription,
        );

        const response = await createApp().handle(
          new Request("http://localhost/subscriptions/sub-1", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ color }),
          }),
        );

        expect(response.status).toBe(500);
        const text = await readText(response);
        expect(text).toContain("Color must be one of:");
        expect(mockTransaction).not.toHaveBeenCalled();
      },
    );

    it("includes all allowed colors in error message", async () => {
      mockPrisma.calendarSubscription.findFirst.mockResolvedValue(
        existingSubscription,
      );

      const response = await createApp().handle(
        new Request("http://localhost/subscriptions/sub-1", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ color: "invalid" }),
        }),
      );

      const text = await readText(response);
      for (const color of ALLOWED_CALENDAR_COLORS) {
        expect(text).toContain(color);
      }
    });

    it("allows update without color field", async () => {
      mockPrisma.calendarSubscription.findFirst.mockResolvedValue(
        existingSubscription,
      );
      mockTransaction.mockImplementation(async (fn: any) => {
        const tx = {
          calendar: { update: jest.fn(async () => ({})) },
          calendarSubscription: {
            update: jest.fn(async () => ({
              ...existingSubscription,
              name: "Updated",
            })),
          },
        };
        return fn(tx);
      });

      const response = await createApp().handle(
        new Request("http://localhost/subscriptions/sub-1", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Updated" }),
        }),
      );

      expect(response.status).toBe(200);
    });

    it("rejects update for non-existent subscription", async () => {
      mockPrisma.calendarSubscription.findFirst.mockResolvedValue(null);

      const response = await createApp().handle(
        new Request("http://localhost/subscriptions/sub-missing", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ color: "rose" }),
        }),
      );

      expect(response.status).toBe(500);
      const text = await readText(response);
      expect(text).toContain("Subscription not found");
    });
  });
});
