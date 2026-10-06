import { describe, expect, it, jest } from "@jest/globals";

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

jest.mock("../../lib/user-setup", () => ({
  ensureUserCalendars: jest.fn(),
}));

import { EventService } from "../../services/event.service";

const baseDate = new Date("2026-05-26T10:00:00.000Z");
const updatedAt = new Date("2026-05-25T10:00:00.000Z");

function calendarFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "calendar-1",
    name: "Work",
    color: "#10b981",
    kind: "owned",
    isSyncOnly: false,
    isVisible: true,
    isDefault: true,
    icsShareEnabled: false,
    forceFullEncryption: false,
    stalwartCalendarId: "remote-cal-1",
    ...overrides,
  };
}

function eventFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    title: "Planning",
    description: "Discuss roadmap",
    start: baseDate,
    end: new Date("2026-05-26T11:00:00.000Z"),
    allDay: false,
    timezone: "UTC",
    location: "Room A",
    color: null,
    isPrivate: false,
    reminder: null,
    recurrence: null,
    isCancelled: false,
    calendarId: "calendar-1",
    categoryId: null,
    userId: "user-1",
    externalId: "event-uid@solace-calendar.local",
    encryptedContent: null,
    blindIndexTokens: null,
    encryptionState: "plaintext",
    encryptionKeyVersion: null,
    isSynced: false,
    stalwartAccountId: "acct-1",
    stalwartCalendarId: "remote-cal-1",
    stalwartEventId: "remote-event-1",
    stalwartUid: "event-uid@solace-calendar.local",
    stalwartSyncedAt: baseDate,
    createdAt: baseDate,
    updatedAt,
    category: null,
    calendar: calendarFixture(),
    participants: [],
    ...overrides,
  };
}

function createMockStalwartClient() {
  return {
    listCalendars: jest.fn(async () => []),
    createCalendar: jest.fn(async () => ({ id: "remote-cal-1" })),
    updateCalendar: jest.fn(async () => undefined),
    deleteCalendar: jest.fn(async () => undefined),
    queryEventIds: jest.fn(async () => []),
    getEvents: jest.fn(async () => []),
    createEvent: jest.fn(async () => ({ id: "remote-event-1" })),
    updateEvent: jest.fn(async () => undefined),
    deleteEvent: jest.fn(async () => undefined),
    listAddressBooks: jest.fn(async () => []),
    createContactCard: jest.fn(async () => ({ id: "contact-1" })),
  };
}

function createParticipantService() {
  return {
    syncParticipants: jest.fn(async () => ({
      participants: [],
      sendPendingInvitations: jest.fn(async () => []),
    })),
  };
}

function createInvitationTargetCalendarMock() {
  return calendarFixture({
    forceFullEncryption: false,
    stalwartAccountId: "acct-1",
    stalwartCalendarId: "remote-cal-1",
  });
}

function createInvitationResolutionPrismaMock(
  overrides: Record<string, unknown> = {},
) {
  const targetCalendar = createInvitationTargetCalendarMock();
  return {
    userSettings: {
      findUnique: jest.fn(async () => ({ defaultCalendarId: "calendar-1" })),
    },
    mailDirectoryEntry: {
      findUnique: jest.fn(async () => ({ stalwartAccountId: "acct-1" })),
    },
    calendar: {
      findFirst: jest.fn(async () => targetCalendar),
      findMany: jest.fn(async () => [targetCalendar]),
      count: jest.fn(async () => 1),
      create: jest.fn(async () => targetCalendar),
      update: jest.fn(async () => targetCalendar),
    },
    eventParticipant: {
      update: jest.fn(async () => undefined),
    },
    ...overrides,
  };
}

describe("EventService.list", () => {
  it("expands split series and returns detached occurrences only once", async () => {
    const split = eventFixture({
      id: "split", parentEventId: "old-series",
      recurrence: JSON.stringify({ frequency: "weekly", interval: 1 }),
      recurrenceExceptions: [],
    });
    const detached = eventFixture({ id: "detached", parentEventId: "split" });
    const findMany = jest.fn<(input: Record<string, unknown>) => Promise<ReturnType<typeof eventFixture>[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([split])
      .mockResolvedValueOnce([detached]);
    const prisma = {
      calendarEvent: { findMany },
      calendar: { findMany: jest.fn(async () => []) },
      eventCategory: { findMany: jest.fn(async () => []) },
    };
    const result = await new EventService(prisma as never).list({
      userId: "user-1", start: "2026-05-26T00:00:00Z", end: "2026-06-03T00:00:00Z",
    });
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({ where: { parentEventId: null } });
    expect(findMany.mock.calls[1]?.[0].where).not.toHaveProperty("parentEventId");
    expect(findMany.mock.calls[2]?.[0]).toMatchObject({ where: { recurrence: null } });
    expect(result.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "split_2026-06-02T10:00:00.000Z" }),
      expect.objectContaining({ id: "detached" }),
    ]));
    expect(result.events.filter((event) => (event as { id: string }).id === "detached")).toHaveLength(1);
  });
});

describe("EventService.search", () => {
  it("does not keep plaintext match-all clauses when the trimmed query is blank", async () => {
    const queryRawUnsafe = jest.fn<
      (sql: string, ...params: Array<string | number | Date>) => Promise<any[]>
    >(async () => []);
    queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);
    const prisma = {
      $queryRawUnsafe: queryRawUnsafe,
    };

    const service = new EventService(prisma as never);

    await service.search({
      userId: "user-1",
      query: "  ",
      blindIndexTokens: ["idx-1"],
    });

    const resultsSql = prisma.$queryRawUnsafe.mock.calls[0]?.[0] as string;
    const countSql = prisma.$queryRawUnsafe.mock.calls[1]?.[0] as string;

    expect(resultsSql).toContain("FALSE");
    expect(resultsSql).not.toContain("OR e.title ILIKE '%' || $2 || '%'");
    expect(countSql).toContain("FALSE");
    expect(countSql).not.toContain("OR e.title ILIKE '%' || $2 || '%'");
  });

  it("loads participants only for events owned by the searching user", async () => {
    const eventParticipantFindMany = jest.fn(async () => []);
    const queryRawUnsafe = jest.fn<
      (sql: string, ...params: Array<string | number | Date>) => Promise<any[]>
    >(async () => [])
      .mockResolvedValueOnce([{ id: "event-1", user_id: "user-1" }])
      .mockResolvedValueOnce([{ total: 1 }]);
    const prisma = {
      $queryRawUnsafe: queryRawUnsafe,
      eventParticipant: { findMany: eventParticipantFindMany },
    };

    await new EventService(prisma as never).search({
      userId: "user-1",
      query: "meeting",
    });

    expect(eventParticipantFindMany).toHaveBeenCalledWith({
      where: {
        eventId: { in: ["event-1"] },
        event: { userId: "user-1" },
      },
      include: { user: { select: expect.any(Object) } },
    });
  });
});

describe("EventService.searchCorpus", () => {
  it("filters declined attendee copies before pagination", async () => {
    const visibleEvent = eventFixture({
      id: "event-visible",
      title: "Visible event",
      participants: [
        {
          id: "participant-visible",
          eventId: "event-visible",
          userId: "user-1",
          email: "testingprod15@solace.onl",
          displayName: "Test User",
          role: "attendee",
          status: "accepted",
          user: {
            id: "user-1",
            name: "Test User",
            email: "testingprod15@solace.onl",
            image: null,
          },
        },
      ],
    });
    const prisma = {
      calendarEvent: {
        findMany: jest.fn(async () => [visibleEvent] as never),
        count: jest.fn(async () => 2),
      },
    };

    const service = new EventService(prisma as never);
    const result = await service.searchCorpus({
      userId: "user-1",
      limit: 1,
      offset: 0,
    });

    expect(prisma.calendarEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user-1",
          NOT: {
            participants: {
              some: {
                userId: "user-1",
                role: { not: "organizer" },
                status: "declined",
              },
            },
          },
        },
        take: 1,
        skip: 0,
      }),
    );
    expect(prisma.calendarEvent.count).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        NOT: {
          participants: {
            some: {
              userId: "user-1",
              role: { not: "organizer" },
              status: "declined",
            },
          },
        },
      },
    });
    expect(result).toEqual({
      events: [
        expect.objectContaining({
          id: "event-visible",
          title: "Visible event",
        }),
      ],
      total: 2,
      nextOffset: 1,
    });
  });
});

describe("EventService.list", () => {
  it("hides declined invite copies from the calendar results", async () => {
    const declinedEvent = eventFixture({
      id: "event-declined",
      participants: [
        {
          id: "participant-declined",
          eventId: "event-declined",
          userId: "user-1",
          email: "testingprod15@solace.onl",
          displayName: "Test User",
          role: "attendee",
          status: "declined",
          user: {
            id: "user-1",
            name: "Test User",
            email: "testingprod15@solace.onl",
            image: null,
          },
        },
      ],
    });
    const visibleEvent = eventFixture({
      id: "event-visible",
      title: "Visible event",
      participants: [
        {
          id: "participant-visible",
          eventId: "event-visible",
          userId: "user-1",
          email: "testingprod15@solace.onl",
          displayName: "Test User",
          role: "attendee",
          status: "accepted",
          user: {
            id: "user-1",
            name: "Test User",
            email: "testingprod15@solace.onl",
            image: null,
          },
        },
      ],
    });
    const prisma = {
      userSettings: {
        findUnique: jest.fn(async () => ({ timezone: "UTC" })),
      },
      calendarEvent: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([declinedEvent, visibleEvent] as never)
          .mockResolvedValueOnce([] as never)
          .mockResolvedValueOnce([] as never),
      },
      eventCategory: {
        findMany: jest.fn(async () => []),
      },
      calendar: {
        findMany: jest.fn(async () => [calendarFixture()]),
      },
    };

    const service = new EventService(prisma as never);
    const result = await service.list({
      userId: "user-1",
      start: "2026-05-26T00:00:00.000Z",
      end: "2026-05-27T00:00:00.000Z",
    });

    expect(result.events).toEqual([
      expect.objectContaining({
        id: "event-visible",
        title: "Visible event",
      }),
    ]);
  });

});
