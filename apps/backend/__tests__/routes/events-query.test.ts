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
  buildIcsEventFile: jest.fn(),
  findNationalHolidayCalendarByUrl: jest.fn(),
}));

jest.mock("../../lib/prisma", () => ({
  prisma: {
    calendarEvent: {
      findMany: jest.fn(async (): Promise<any> => []),
      findFirst: jest.fn(async (): Promise<any> => null),
      create: jest.fn(async (): Promise<any> => null),
      update: jest.fn(async (): Promise<any> => null),
      delete: jest.fn(async (): Promise<any> => null),
    },
    calendar: {
      findFirst: jest.fn(async (): Promise<any> => null),
      findMany: jest.fn(async (): Promise<any> => []),
    },
    eventCategory: {
      findFirst: jest.fn(async (): Promise<any> => null),
      findMany: jest.fn(async (): Promise<any> => []),
    },
    eventNotification: {
      create: jest.fn(async (): Promise<any> => null),
      deleteMany: jest.fn(async (): Promise<any> => ({ count: 0 })),
    },
    recurrenceException: {
      create: jest.fn(async (): Promise<any> => null),
    },
    userSettings: {
      findUnique: jest.fn(
        async (): Promise<any> => ({
          timezone: "UTC",
          eventEncryptionMode: "hybrid",
          emailNotifications: true,
        }),
      ),
    },
    user: {
      findUnique: jest.fn(
        async (): Promise<any> => ({
          id: "user-1",
          email: "owner@example.com",
          name: "Owner",
        }),
      ),
      findMany: jest.fn(async (): Promise<any> => []),
    },
    eventParticipant: {
      findMany: jest.fn(async (): Promise<any> => []),
      upsert: jest.fn(async (): Promise<any> => null),
      deleteMany: jest.fn(async (): Promise<any> => ({ count: 0 })),
    },
    mailDirectoryEntry: {
      findUnique: jest.fn(async (): Promise<any> => null),
      findMany: jest.fn(async (): Promise<any> => []),
    },
  },
}));

jest.mock("../../lib/email-client", () => ({
  mailer: {
    emails: {
      send: jest.fn(async () => ({ data: { id: "email-1" } })),
    },
  },
  authEmailFrom: "Solace <test@example.com>",
}));

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

jest.mock("../../lib/user-setup", () => ({
  ensureUserCalendars: jest.fn(async (): Promise<any> => undefined),
}));

jest.mock("../../lib/ics-export", () => ({
  toIcsBuildEvent: jest.fn(),
  toSafeIcsFilename: jest.fn(() => "event.ics"),
}));

import { errorHandler } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { eventsRoutes } from "../../routes/events";

const mockPrisma = prisma as unknown as {
  calendarEvent: {
    findFirst: jest.Mock<() => Promise<any>>;
  };
};

function createApp() {
  return new Elysia({ normalize: false }).use(errorHandler).use(eventsRoutes);
}

describe("eventsRoutes query coercion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.calendarEvent.findFirst.mockResolvedValue({
      id: "event-invite-1",
      title: "Invite",
      externalId: "uid-123@example.com",
      userId: "user-1",
    });
  });

  it("accepts string limit and offset on /events/search", async () => {
    const response = await createApp().handle(
      new Request(
        "http://localhost/events/search?q=meet&limit=10&offset=5",
      ),
    );

    expect(response.status).not.toBe(422);
  });

  it("accepts syncRemote=false on invitation lookup", async () => {
    const response = await createApp().handle(
      new Request(
        "http://localhost/events/invitations/by-external-id?externalId=uid-123%40example.com&syncRemote=false",
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      event: expect.objectContaining({ id: "event-invite-1" }),
    });
  });
});
