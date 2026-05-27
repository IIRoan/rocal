import { describe, expect, it, jest } from "@jest/globals";
import type { CalendarEvent } from "../../generated/prisma/index.js";
import { MailCalendarIngestionService } from "../../services/mail-calendar-ingestion.service";

type CalendarMockResult = {
  id: string;
  name: string;
  color: string;
  kind: string;
  isVisible: boolean;
  isDefault: boolean;
  isSyncOnly: boolean;
  forceFullEncryption: boolean;
  stalwartAccountId: string | null;
  stalwartCalendarId: string | null;
} | null;

function createPrismaMock() {
  return {
    userSettings: {
      findUnique: jest.fn(
        async ({ select }: { select: Record<string, boolean> }) => {
          if (select.timezone) {
            return { timezone: "UTC" };
          }
          return { defaultCalendarId: "calendar-1" };
        },
      ),
    },
    calendar: {
      findFirst: jest.fn<() => Promise<CalendarMockResult>>(async () => ({
        id: "calendar-1",
        name: "Personal",
        color: "#10b981",
        kind: "owned",
        isVisible: true,
        isDefault: true,
        isSyncOnly: false,
        forceFullEncryption: false,
        stalwartAccountId: null,
        stalwartCalendarId: null,
      })),
      count: jest.fn(async () => 1),
      create: jest.fn(),
      update: jest.fn(),
    },
    mailDirectoryEntry: {
      findUnique: jest.fn<() => Promise<{ stalwartAccountId: string } | null>>(
        async () => null,
      ),
    },
    calendarEvent: {
      findMany: jest.fn<() => Promise<CalendarEvent[]>>(async () => []),
      create: jest.fn(async (input: unknown) => input),
      update: jest.fn(async (input: unknown) => input),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
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

function buildIcs(input: {
  method?: string;
  uid?: string;
  title?: string;
  description?: string;
  location?: string;
  attendees?: string[];
}): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `METHOD:${input.method ?? "REQUEST"}`,
    "BEGIN:VEVENT",
    `UID:${input.uid ?? "invite-1@example.com"}`,
    "DTSTART:20260527T100000Z",
    "DTEND:20260527T110000Z",
    `SUMMARY:${input.title ?? "Planning sync"}`,
    `DESCRIPTION:${input.description ?? "Discuss roadmap"}`,
    `LOCATION:${input.location ?? "Amsterdam"}`,
    ...(input.attendees ?? []).map(
      (email) =>
        `ATTENDEE;CN=${email.split("@")[0]};PARTSTAT=NEEDS-ACTION:mailto:${email}`,
    ),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function createExistingEvent(
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  return {
    id: "event-1",
    title: "Old title",
    description: "Old description",
    encryptedContent: null,
    blindIndexTokens: null,
    encryptionState: "plaintext",
    encryptionKeyVersion: 1,
    start: new Date("2026-05-27T10:00:00.000Z"),
    end: new Date("2026-05-27T11:00:00.000Z"),
    allDay: false,
    location: "Old room",
    color: null,
    timezone: "UTC",
    isPrivate: false,
    reminder: null,
    recurrence: null,
    parentEventId: null,
    isSynced: false,
    externalId: "invite-1@example.com",
    subscriptionId: null,
    syncedAt: null,
    stalwartAccountId: null,
    stalwartCalendarId: null,
    stalwartEventId: null,
    stalwartUid: null,
    stalwartSyncedAt: null,
    userId: "user-1",
    calendarId: "calendar-1",
    categoryId: null,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("MailCalendarIngestionService", () => {
  it("imports calendar invitations from raw ICS content", async () => {
    const prisma = createPrismaMock();
    const service = new MailCalendarIngestionService(prisma as never);

    const summary = await service.ingestIcsContent({
      userId: "user-1",
      icsContent: buildIcs({ title: "Decrypted invite" }),
      sourceId: "Decrypted message",
    });

    expect(summary).toEqual({
      messagesScanned: 1,
      icsPartsFound: 1,
      eventsCreated: 1,
      eventsUpdated: 0,
      eventsDeleted: 0,
      errors: [],
    });
    expect(prisma.calendarEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "Decrypted invite",
        externalId: "invite-1@example.com",
        calendarId: "calendar-1",
        userId: "user-1",
      }),
    });
  });

  it("creates calendar events from text/calendar message parts", async () => {
    const prisma = createPrismaMock();
    const service = new MailCalendarIngestionService(prisma as never);

    const summary = await service.ingestFromEmails({
      userId: "user-1",
      emails: [
        {
          id: "mail-1",
          subject: "Invitation",
          bodyStructure: {
            type: "multipart/mixed",
            subParts: [
              {
                partId: "ics",
                type: "text/calendar; method=REQUEST",
                name: "invite.ics",
              },
            ],
          },
          bodyValues: {
            ics: { value: buildIcs({}) },
          },
        },
      ],
    });

    expect(summary).toEqual({
      messagesScanned: 1,
      icsPartsFound: 1,
      eventsCreated: 1,
      eventsUpdated: 0,
      eventsDeleted: 0,
      errors: [],
    });
    expect(prisma.calendarEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "Planning sync",
        description: "Discuss roadmap",
        location: "Amsterdam",
        externalId: "invite-1@example.com",
        calendarId: "calendar-1",
        userId: "user-1",
        isSynced: false,
      }),
    });
  });

  it("updates matching existing events instead of duplicating them", async () => {
    const prisma = createPrismaMock();
    prisma.calendarEvent.findMany.mockResolvedValueOnce([
      createExistingEvent(),
    ]);
    const service = new MailCalendarIngestionService(prisma as never);

    const summary = await service.ingestFromEmails({
      userId: "user-1",
      emails: [
        {
          id: "mail-1",
          bodyValues: {
            calendar: {
              value: buildIcs({
                title: "Updated planning sync",
                description: "Updated agenda",
                location: "Room 42",
              }),
            },
          },
        },
      ],
    });

    expect(summary.eventsCreated).toBe(0);
    expect(summary.eventsUpdated).toBe(1);
    expect(prisma.calendarEvent.create).not.toHaveBeenCalled();
    expect(prisma.calendarEvent.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: expect.objectContaining({
        title: "Updated planning sync",
        description: "Updated agenda",
        location: "Room 42",
      }),
    });
  });

  it("deletes matching events for CANCEL messages", async () => {
    const prisma = createPrismaMock();
    prisma.calendarEvent.deleteMany.mockResolvedValueOnce({ count: 1 });
    const service = new MailCalendarIngestionService(prisma as never);

    const summary = await service.ingestFromEmails({
      userId: "user-1",
      emails: [
        {
          id: "mail-1",
          bodyValues: {
            calendar: {
              value: buildIcs({ method: "CANCEL" }),
            },
          },
        },
      ],
    });

    expect(summary.eventsDeleted).toBe(1);
    expect(prisma.calendarEvent.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        externalId: "invite-1@example.com",
        subscriptionId: null,
      },
    });
  });

  it("does not import plaintext ICS into full-encryption-only calendars", async () => {
    const prisma = createPrismaMock();
    prisma.calendar.findFirst.mockResolvedValue(null);
    prisma.calendar.count.mockResolvedValueOnce(1);
    const service = new MailCalendarIngestionService(prisma as never);

    const summary = await service.ingestFromEmails({
      userId: "user-1",
      emails: [
        {
          id: "mail-1",
          bodyValues: {
            calendar: {
              value: buildIcs({}),
            },
          },
        },
      ],
    });

    expect(summary.eventsCreated).toBe(0);
    expect(summary.errors).toEqual([
      "No writable calendar is available for ICS mail imports.",
    ]);
    expect(prisma.calendarEvent.create).not.toHaveBeenCalled();
  });

  it("syncs parsed ICS attendees into imported event participants", async () => {
    const prisma = createPrismaMock();
    const eventParticipantService = {
      syncParticipants: jest.fn(async () => ({
        changed: true,
        participants: [],
      })),
    };
    const service = new MailCalendarIngestionService(
      prisma as never,
      eventParticipantService as never,
    );

    await service.ingestFromEmails({
      userId: "user-1",
      emails: [
        {
          id: "mail-2",
          bodyValues: {
            calendar: {
              value: buildIcs({
                attendees: ["teammate@example.com"],
              }),
            },
          },
        },
      ],
    });

    expect(eventParticipantService.syncParticipants).toHaveBeenCalledWith(
      expect.objectContaining({
        participants: [
          expect.objectContaining({
            email: "teammate@example.com",
            role: "attendee",
          }),
        ],
      }),
    );
  });

  it("mirrors inbound invitations into Stalwart without sending scheduling mail", async () => {
    const prisma = createPrismaMock();
    const stalwartClient = createMockStalwartClient();
    prisma.mailDirectoryEntry.findUnique.mockResolvedValue({
      stalwartAccountId: "acct-1",
    });
    prisma.calendar.findFirst.mockResolvedValue({
      id: "calendar-1",
      name: "Personal",
      color: "#10b981",
      kind: "owned",
      isVisible: true,
      isDefault: true,
      isSyncOnly: false,
      forceFullEncryption: false,
      stalwartAccountId: "acct-1",
      stalwartCalendarId: "remote-cal-1",
    });
    const service = new MailCalendarIngestionService(
      prisma as never,
      undefined,
      stalwartClient,
    );

    await service.ingestFromEmails({
      userId: "user-1",
      emails: [
        {
          id: "mail-1",
          bodyValues: {
            calendar: {
              value: buildIcs({
                attendees: ["testingprod15@solace.onl"],
              }),
            },
          },
        },
      ],
    });

    expect(stalwartClient.createCalendar).not.toHaveBeenCalled();
    expect(stalwartClient.createEvent).toHaveBeenCalledWith({
      accountId: "acct-1",
      event: expect.objectContaining({
        calendarIds: { "remote-cal-1": true },
        uid: "invite-1@example.com",
        title: "Planning sync",
      }),
      sendSchedulingMessages: false,
    });
    expect(prisma.calendarEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stalwartAccountId: "acct-1",
        stalwartCalendarId: "remote-cal-1",
        stalwartEventId: "remote-event-1",
        stalwartUid: "invite-1@example.com",
      }),
    });
  });

  it("does not provision a new Stalwart calendar during mail invite imports", async () => {
    const prisma = createPrismaMock();
    const stalwartClient = createMockStalwartClient();
    prisma.mailDirectoryEntry.findUnique.mockResolvedValue({
      stalwartAccountId: "acct-1",
    });
    const service = new MailCalendarIngestionService(
      prisma as never,
      undefined,
      stalwartClient,
    );

    await service.ingestFromEmails({
      userId: "user-1",
      emails: [
        {
          id: "mail-1",
          bodyValues: {
            calendar: {
              value: buildIcs({}),
            },
          },
        },
      ],
    });

    expect(stalwartClient.createCalendar).not.toHaveBeenCalled();
    expect(stalwartClient.createEvent).not.toHaveBeenCalled();
    expect(prisma.calendarEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "Planning sync",
        stalwartCalendarId: null,
        stalwartEventId: null,
      }),
    });
  });

  it("rolls back remote invitation events if local creation fails", async () => {
    const prisma = createPrismaMock();
    const stalwartClient = createMockStalwartClient();
    prisma.mailDirectoryEntry.findUnique.mockResolvedValue({
      stalwartAccountId: "acct-1",
    });
    prisma.calendar.findFirst.mockResolvedValue({
      id: "calendar-1",
      name: "Personal",
      color: "#10b981",
      kind: "owned",
      isVisible: true,
      isDefault: true,
      isSyncOnly: false,
      forceFullEncryption: false,
      stalwartAccountId: "acct-1",
      stalwartCalendarId: "remote-cal-1",
    });
    prisma.calendarEvent.create.mockRejectedValue(new Error("db down"));
    const service = new MailCalendarIngestionService(
      prisma as never,
      undefined,
      stalwartClient,
    );

    const summary = await service.ingestFromEmails({
      userId: "user-1",
      emails: [
        {
          id: "mail-1",
          bodyValues: {
            calendar: { value: buildIcs({}) },
          },
        },
      ],
    });

    expect(summary.eventsCreated).toBe(0);
    expect(summary.errors).toEqual(["Message mail-1: db down"]);
    expect(stalwartClient.deleteEvent).toHaveBeenCalledWith({
      accountId: "acct-1",
      eventId: "remote-event-1",
      sendSchedulingMessages: false,
    });
  });

  it("applies REPLY updates to existing Stalwart-backed invitations", async () => {
    const prisma = createPrismaMock();
    const stalwartClient = createMockStalwartClient();
    const eventParticipantService = {
      syncParticipants: jest.fn(async () => ({
        changed: true,
        participants: [],
        sendPendingInvitations: jest.fn(async () => undefined),
      })),
    };
    prisma.mailDirectoryEntry.findUnique.mockResolvedValue({
      stalwartAccountId: "acct-1",
    });
    prisma.calendar.findFirst.mockResolvedValue({
      id: "calendar-1",
      name: "Personal",
      color: "#10b981",
      kind: "owned",
      isVisible: true,
      isDefault: true,
      isSyncOnly: false,
      forceFullEncryption: false,
      stalwartAccountId: "acct-1",
      stalwartCalendarId: "remote-cal-1",
    });
    prisma.calendarEvent.findMany.mockResolvedValueOnce([
      {
        ...createExistingEvent({
          stalwartAccountId: "acct-1",
          stalwartCalendarId: "remote-cal-1",
          stalwartEventId: "remote-event-1",
          stalwartUid: "invite-1@example.com",
        }),
        participants: [
          {
            email: "teammate@example.com",
            displayName: "teammate",
            role: "attendee",
            status: "pending",
          },
        ],
      },
    ] as never);
    const service = new MailCalendarIngestionService(
      prisma as never,
      eventParticipantService as never,
      stalwartClient,
    );

    const summary = await service.ingestFromEmails({
      userId: "user-1",
      emails: [
        {
          id: "mail-reply-1",
          bodyValues: {
            calendar: {
              value: [
                "BEGIN:VCALENDAR",
                "VERSION:2.0",
                "METHOD:REPLY",
                "BEGIN:VEVENT",
                "UID:invite-1@example.com",
                "DTSTART:20260527T100000Z",
                "DTEND:20260527T110000Z",
                "SUMMARY:Planning sync",
                "ATTENDEE;CN=teammate;PARTSTAT=ACCEPTED:mailto:teammate@example.com",
                "END:VEVENT",
                "END:VCALENDAR",
              ].join("\r\n"),
            },
          },
        },
      ],
    });

    expect(summary.eventsUpdated).toBe(1);
    expect(stalwartClient.updateEvent).toHaveBeenCalledWith({
      accountId: "acct-1",
      eventId: "remote-event-1",
      patch: expect.objectContaining({
        calendarIds: { "remote-cal-1": true },
        uid: "invite-1@example.com",
      }),
      sendSchedulingMessages: false,
    });
    expect(eventParticipantService.syncParticipants).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        participants: [
          expect.objectContaining({
            email: "teammate@example.com",
            status: "accepted",
          }),
        ],
      }),
    );
  });
});
