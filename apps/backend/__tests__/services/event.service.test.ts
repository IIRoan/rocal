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
      sendPendingInvitations: jest.fn(async () => undefined),
    })),
  };
}

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

describe("EventService Stalwart integration", () => {
  it("creates remote Stalwart events and stores mapping metadata", async () => {
    const stalwartClient = createMockStalwartClient();
    const participantService = createParticipantService();
    const prisma = {
      calendar: {
        findFirst: jest.fn(async () => calendarFixture()),
        update: jest.fn(async () => calendarFixture()),
      },
      eventCategory: {
        findFirst: jest.fn(async () => null),
      },
      userSettings: {
        findUnique: jest.fn(async () => ({
          timezone: "UTC",
          emailNotifications: false,
          eventEncryptionMode: "metadata",
        })),
      },
      mailDirectoryEntry: {
        findUnique: jest.fn(async () => ({ stalwartAccountId: "acct-1" })),
      },
      user: {
        findUnique: jest.fn(async () => ({
          email: "owner@example.com",
          name: "Owner",
        })),
      },
      calendarEvent: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
          eventFixture({ ...data, id: "event-1" }),
        ),
      },
      eventNotification: {
        findMany: jest.fn(async () => []),
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
      notificationLog: {
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
      $executeRaw: jest.fn(async () => undefined),
    };
    const service = new EventService(
      prisma as never,
      participantService as never,
      stalwartClient,
    );

    await service.create({
      userId: "user-1",
      title: "Planning",
      description: "Discuss roadmap",
      start: "2026-05-26T10:00:00.000Z",
      end: "2026-05-26T11:00:00.000Z",
      calendarId: "calendar-1",
      timezone: "UTC",
      location: "Room A",
      participants: [{ email: "guest@example.com", role: "attendee" }],
    });

    expect(stalwartClient.createEvent).toHaveBeenCalledWith({
      accountId: "acct-1",
      event: expect.objectContaining({
        "@type": "Event",
        calendarIds: { "remote-cal-1": true },
        title: "Planning",
        description: "Discuss roadmap",
        start: "2026-05-26T10:00:00",
        duration: "PT1H",
        timeZone: "Etc/UTC",
        locations: {
          primary: {
            "@type": "Location",
            name: "Room A",
          },
        },
        participants: expect.any(Object),
      }),
    });
    expect(prisma.calendarEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stalwartAccountId: "acct-1",
          stalwartCalendarId: "remote-cal-1",
          stalwartEventId: "remote-event-1",
          stalwartSyncedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("rolls remote events back when local event creation fails", async () => {
    const stalwartClient = createMockStalwartClient();
    const participantService = createParticipantService();
    const prisma = {
      calendar: {
        findFirst: jest.fn(async () => calendarFixture()),
        update: jest.fn(async () => calendarFixture()),
      },
      eventCategory: {
        findFirst: jest.fn(async () => null),
      },
      userSettings: {
        findUnique: jest.fn(async () => ({
          timezone: "UTC",
          emailNotifications: false,
          eventEncryptionMode: "metadata",
        })),
      },
      mailDirectoryEntry: {
        findUnique: jest.fn(async () => ({ stalwartAccountId: "acct-1" })),
      },
      user: {
        findUnique: jest.fn(async () => ({
          email: "owner@example.com",
          name: "Owner",
        })),
      },
      calendarEvent: {
        create: jest.fn(async () => {
          throw new Error("database unavailable");
        }),
      },
    };
    const service = new EventService(
      prisma as never,
      participantService as never,
      stalwartClient,
    );

    await expect(
      service.create({
        userId: "user-1",
        title: "Planning",
        start: "2026-05-26T10:00:00.000Z",
        end: "2026-05-26T11:00:00.000Z",
        calendarId: "calendar-1",
      }),
    ).rejects.toThrow("database unavailable");

    expect(stalwartClient.deleteEvent).toHaveBeenCalledWith({
      accountId: "acct-1",
      eventId: "remote-event-1",
      sendSchedulingMessages: false,
    });
  });

  it("updates linked Stalwart events before saving local changes", async () => {
    const stalwartClient = createMockStalwartClient();
    const participantService = createParticipantService();
    const existingEvent = eventFixture();
    const prisma = {
      calendarEvent: {
        findFirst: jest.fn(async () => existingEvent),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
          eventFixture({ ...data }),
        ),
      },
      calendar: {
        findFirst: jest.fn(async () => calendarFixture()),
        update: jest.fn(async () => calendarFixture()),
      },
      eventCategory: {
        findFirst: jest.fn(async () => null),
      },
      userSettings: {
        findUnique: jest.fn(async () => ({
          timezone: "UTC",
          emailNotifications: false,
          eventEncryptionMode: "metadata",
        })),
      },
      eventNotification: {
        findMany: jest.fn(async () => []),
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
      eventParticipant: {
        findMany: jest.fn(async () => []),
      },
      mailDirectoryEntry: {
        findUnique: jest.fn(async () => ({ stalwartAccountId: "acct-1" })),
      },
      user: {
        findUnique: jest.fn(async () => null),
      },
      $executeRaw: jest.fn(async () => undefined),
    };
    const service = new EventService(
      prisma as never,
      participantService as never,
      stalwartClient,
    );

    await service.update({
      userId: "user-1",
      eventId: "event-1",
      title: "Updated planning",
      start: "2026-05-26T12:00:00.000Z",
      end: "2026-05-26T13:00:00.000Z",
    });

    expect(stalwartClient.updateEvent).toHaveBeenCalledWith({
      accountId: "acct-1",
      eventId: "remote-event-1",
      patch: expect.objectContaining({
        calendarIds: { "remote-cal-1": true },
        uid: "event-uid@solace-calendar.local",
        title: "Updated planning",
        start: "2026-05-26T12:00:00",
        duration: "PT1H",
      }),
    });
    expect(prisma.calendarEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "event-1", updatedAt },
        data: expect.objectContaining({
          title: "Updated planning",
          stalwartEventId: "remote-event-1",
          stalwartSyncedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("prevents attendees from editing imported invitation copies", async () => {
    const prisma = {
      calendarEvent: {
        findFirst: jest.fn(async () =>
          eventFixture({
            participants: [
              {
                id: "participant-self",
                eventId: "event-1",
                userId: "user-1",
                email: "testingprod15@solace.onl",
                displayName: "Test User",
                role: "attendee",
                status: "accepted",
              },
            ],
          }),
        ),
      },
    };
    const service = new EventService(prisma as never);

    await expect(
      service.update({
        userId: "user-1",
        eventId: "event-1",
        title: "Should fail",
      }),
    ).rejects.toThrow(
      "Imported invitation events are read-only for attendees.",
    );
  });

  it("updates attendee RSVP locally and in Stalwart", async () => {
    const stalwartClient = createMockStalwartClient();
    const participantService = createParticipantService();
    const organizerParticipant = {
      id: "participant-organizer",
      eventId: "event-1",
      userId: null,
      email: "organizer@example.com",
      displayName: "Organizer",
      role: "organizer",
      status: "accepted",
      user: null,
    };
    const selfParticipant = {
      id: "participant-self",
      eventId: "event-1",
      userId: "user-1",
      email: "testingprod15@solace.onl",
      displayName: "Test User",
      role: "attendee",
      status: "pending",
      user: {
        id: "user-1",
        name: "Test User",
        email: "testingprod15@solace.onl",
        image: null,
      },
    };
    const pendingEvent = eventFixture({
      participants: [organizerParticipant, selfParticipant],
    });
    const acceptedEvent = eventFixture({
      participants: [
        organizerParticipant,
        { ...selfParticipant, status: "accepted" },
      ],
    });
    stalwartClient.listCalendars.mockResolvedValue([
      {
        id: "remote-cal-1",
        name: "Work",
        color: "#10b981",
        isVisible: true,
        isDefault: true,
      },
    ] as never);
    stalwartClient.getEvents.mockResolvedValue([
      {
        id: "remote-event-1",
        uid: "event-uid@solace-calendar.local",
        calendarIds: { "remote-cal-1": true },
        title: "Planning",
        description: "Discuss roadmap",
        start: "2026-05-26T10:00:00",
        duration: "PT1H",
        timeZone: "UTC",
        participants: {
          organizer: {
            calendarAddress: "mailto:organizer@example.com",
            name: "Organizer",
            roles: { owner: true },
            participationStatus: "accepted",
          },
          self: {
            calendarAddress: "mailto:testingprod15@solace.onl",
            name: "Test User",
            roles: { attendee: true },
            participationStatus: "accepted",
          },
        },
      },
    ] as never);
    const prisma = {
      user: {
        findUnique: jest.fn(async () => ({
          email: "testingprod15@solace.onl",
        })),
      },
      calendar: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([calendarFixture()] as never)
          .mockResolvedValueOnce([
            { id: "calendar-1", stalwartCalendarId: "remote-cal-1" },
          ] as never),
        update: jest.fn(async () => calendarFixture()),
        create: jest.fn(async () => calendarFixture()),
      },
      calendarEvent: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(pendingEvent as never)
          .mockResolvedValueOnce({
            id: "event-1",
            encryptionState: "plaintext",
          } as never)
          .mockResolvedValueOnce(acceptedEvent as never),
        update: jest.fn(async () => acceptedEvent),
        create: jest.fn(async () => acceptedEvent),
      },
      eventParticipant: {
        update: jest.fn(async () => undefined),
      },
    };
    const service = new EventService(
      prisma as never,
      participantService as never,
      stalwartClient,
    );

    const result = await service.respondToInvitation({
      userId: "user-1",
      eventId: "event-1",
      status: "accepted",
    });

    expect(stalwartClient.updateEvent).toHaveBeenCalledWith({
      accountId: "acct-1",
      eventId: "remote-event-1",
      patch: expect.objectContaining({
        calendarIds: { "remote-cal-1": true },
        participants: expect.any(Object),
      }),
      sendSchedulingMessages: true,
    });
    expect(participantService.syncParticipants).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        participants: expect.arrayContaining([
          expect.objectContaining({
            email: "testingprod15@solace.onl",
            status: "accepted",
          }),
        ]),
        tx: prisma,
      }),
    );
    expect(prisma.eventParticipant.update).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        id: "event-1",
        participants: expect.arrayContaining([
          expect.objectContaining({
            email: "testingprod15@solace.onl",
            status: "accepted",
          }),
        ]),
      }),
    );
  });

  it("falls back to local RSVP updates when the linked Stalwart event id is missing", async () => {
    const stalwartClient = createMockStalwartClient();
    const participantService = createParticipantService();
    const organizerParticipant = {
      id: "participant-organizer",
      eventId: "event-1",
      userId: null,
      email: "organizer@example.com",
      displayName: "Organizer",
      role: "organizer",
      status: "accepted",
      user: null,
    };
    const selfParticipant = {
      id: "participant-self",
      eventId: "event-1",
      userId: "user-1",
      email: "testingprod15@solace.onl",
      displayName: "Test User",
      role: "attendee",
      status: "pending",
      user: {
        id: "user-1",
        name: "Test User",
        email: "testingprod15@solace.onl",
        image: null,
      },
    };
    const pendingEvent = eventFixture({
      stalwartEventId: null,
      participants: [organizerParticipant, selfParticipant],
    });
    const acceptedEvent = eventFixture({
      stalwartEventId: null,
      participants: [
        organizerParticipant,
        { ...selfParticipant, status: "accepted" },
      ],
    });
    const prisma = {
      user: {
        findUnique: jest.fn(async () => ({
          email: "testingprod15@solace.onl",
        })),
      },
      calendarEvent: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(pendingEvent as never)
          .mockResolvedValueOnce(acceptedEvent as never),
      },
      eventParticipant: {
        update: jest.fn(async () => undefined),
      },
    };
    const service = new EventService(
      prisma as never,
      participantService as never,
      stalwartClient,
    );

    const result = await service.respondToInvitation({
      userId: "user-1",
      eventId: "event-1",
      status: "accepted",
    });

    expect(prisma.eventParticipant.update).toHaveBeenCalledWith({
      where: { id: "participant-self" },
      data: { status: "accepted" },
    });
    expect(stalwartClient.updateEvent).not.toHaveBeenCalled();
    expect(stalwartClient.deleteEvent).not.toHaveBeenCalled();
    expect(participantService.syncParticipants).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        id: "event-1",
        participants: expect.arrayContaining([
          expect.objectContaining({
            email: "testingprod15@solace.onl",
            status: "accepted",
          }),
        ]),
      }),
    );
  });

  it("declines invitation locally when the linked Stalwart event id is missing", async () => {
    const stalwartClient = createMockStalwartClient();
    const organizerParticipant = {
      id: "participant-organizer",
      eventId: "event-1",
      userId: null,
      email: "organizer@example.com",
      displayName: "Organizer",
      role: "organizer",
      status: "accepted",
      user: null,
    };
    const selfParticipant = {
      id: "participant-self",
      eventId: "event-1",
      userId: "user-1",
      email: "testingprod15@solace.onl",
      displayName: "Test User",
      role: "attendee",
      status: "pending",
      user: {
        id: "user-1",
        name: "Test User",
        email: "testingprod15@solace.onl",
        image: null,
      },
    };
    const prisma = {
      user: {
        findUnique: jest.fn(async () => ({
          email: "testingprod15@solace.onl",
        })),
      },
      calendarEvent: {
        findFirst: jest.fn(async () =>
          eventFixture({
            stalwartEventId: null,
            participants: [organizerParticipant, selfParticipant],
          }),
        ),
        delete: jest.fn(async () => undefined),
      },
      eventParticipant: {
        update: jest.fn(async () => undefined),
      },
      eventNotification: {
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
      notificationLog: {
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
    };
    const service = new EventService(prisma as never, undefined, stalwartClient);

    await expect(
      service.respondToInvitation({
        userId: "user-1",
        eventId: "event-1",
        status: "declined",
      }),
    ).resolves.toEqual({ deleted: true });

    expect(prisma.eventParticipant.update).toHaveBeenCalledWith({
      where: { id: "participant-self" },
      data: { status: "declined" },
    });
    expect(stalwartClient.updateEvent).not.toHaveBeenCalled();
    expect(stalwartClient.deleteEvent).not.toHaveBeenCalled();
    expect(prisma.calendarEvent.delete).toHaveBeenCalledWith({
      where: { id: "event-1" },
    });
  });

  it("ignores remote-only Stalwart invitation calendars during lookup", async () => {
    const stalwartClient = createMockStalwartClient();
    const prisma = {
      mailDirectoryEntry: {
        findUnique: jest.fn(async () => ({ stalwartAccountId: "acct-1" })),
      },
      calendar: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([] as never),
        update: jest.fn(async () => undefined),
        create: jest.fn(async () => undefined),
      },
      calendarEvent: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null as never)
          .mockResolvedValueOnce(null as never),
      },
    };
    stalwartClient.listCalendars.mockResolvedValue([
      {
        id: "email",
        name: null,
        color: null,
        isVisible: true,
        isDefault: false,
      },
    ] as never);
    stalwartClient.queryEventIds.mockResolvedValue(["remote-event-email"] as never);
    stalwartClient.getEvents.mockResolvedValue([
      {
        id: "remote-event-email",
        uid: "invite-1@example.com",
        calendarIds: { email: true },
        title: "Planning",
        start: "2026-05-26T10:00:00",
        duration: "PT1H",
        timeZone: "UTC",
      },
    ] as never);
    const service = new EventService(prisma as never, undefined, stalwartClient);

    const result = await service.getInvitationByExternalId(
      "user-1",
      "invite-1@example.com",
    );

    expect(result).toBeNull();
    expect(stalwartClient.listCalendars).not.toHaveBeenCalled();
    expect(prisma.calendar.create).not.toHaveBeenCalled();
    expect(prisma.calendar.update).not.toHaveBeenCalled();
  });

  it("allows attendees to delete cancelled invitation copies", async () => {
    const prisma = {
      calendarEvent: {
        findFirst: jest.fn(async () =>
          eventFixture({
            isCancelled: true,
            participants: [
              {
                id: "participant-self",
                eventId: "event-1",
                userId: "user-1",
                email: "testingprod15@solace.onl",
                displayName: "Test User",
                role: "attendee",
                status: "accepted",
              },
            ],
          }),
        ),
        delete: jest.fn(async () => undefined),
      },
      eventNotification: {
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
      notificationLog: {
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) =>
        Promise.all(ops),
      ),
    };
    const service = new EventService(prisma as never);

    await expect(service.delete("user-1", "event-1")).resolves.toEqual(
      expect.objectContaining({
        success: true,
        deletedEventId: "event-1",
      }),
    );
    expect(prisma.calendarEvent.delete).toHaveBeenCalledWith({
      where: { id: "event-1" },
    });
  });
});
