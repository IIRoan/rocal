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

function createOwnedCalendarMock(
  overrides: Partial<NonNullable<CalendarMockResult>> = {},
): NonNullable<CalendarMockResult> {
  return {
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
    ...overrides,
  };
}

function createInvitationStagingCalendarMock(
  overrides: Partial<NonNullable<CalendarMockResult>> = {},
): NonNullable<CalendarMockResult> {
  return createOwnedCalendarMock({
    id: "invitations-cal-1",
    name: "Invitations",
    color: "#78716c",
    isVisible: false,
    isDefault: false,
    ...overrides,
  });
}

function createPrismaMock() {
  const ownedCalendar = createOwnedCalendarMock();
  const stagingCalendar = createInvitationStagingCalendarMock();

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
      findFirst: jest.fn(async (args?: { where?: { id?: string; name?: string } }) => {
        const where = args?.where;
        if (where?.name === "Invitations") {
          return stagingCalendar;
        }
        if (!where?.id || where.id === "calendar-1") {
          return ownedCalendar;
        }
        return null;
      }),
      count: jest.fn(async () => 1),
      create: jest.fn(async (input: { data?: { name?: string } }) =>
        input.data?.name === "Invitations" ? stagingCalendar : ownedCalendar,
      ),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(async () => ({ email: "guest@solace.onl" })),
      findMany: jest.fn(async () => []),
    },
    mailDirectoryEntry: {
      findUnique: jest.fn<() => Promise<{ stalwartAccountId: string } | null>>(
        async () => null,
      ),
    },
    eventParticipant: {
      findMany: jest.fn(async () => []),
      deleteMany: jest.fn(async () => ({ count: 0 })),
      upsert: jest.fn(async () => null),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    calendarEvent: {
      findMany: jest.fn<() => Promise<CalendarEvent[]>>(async () => []),
      create: jest.fn(async (input: unknown) => input),
      update: jest.fn(async (input: unknown) => input),
      updateMany: jest.fn(async () => ({ count: 0 })),
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
    isCancelled: false,
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
  it("imports accepted invitations onto the user's default calendar", async () => {
    const prisma = createPrismaMock();
    const service = new MailCalendarIngestionService(prisma as never);

    const summary = await service.ingestIcsContent({
      userId: "user-1",
      icsContent: buildIcs({ title: "Decrypted invite" }),
      attendeeStatus: "accepted",
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
    expect(prisma.eventParticipant.updateMany).toHaveBeenCalled();
  });

  it("stages new REQUEST invitations as pending ghost events during background mail sync", async () => {
    const prisma = createPrismaMock();
    const service = new MailCalendarIngestionService(prisma as never);

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
        calendarId: "invitations-cal-1",
      }),
    });
  });

  it("still processes CANCEL messages during background mail sync", async () => {
    const prisma = createPrismaMock();
    prisma.calendarEvent.updateMany.mockResolvedValueOnce({ count: 1 });
    const service = new MailCalendarIngestionService(prisma as never);

    const summary = await service.ingestFromEmails({
      userId: "user-1",
      emails: [
        {
          id: "mail-1",
          bodyValues: {
            calendar: { value: buildIcs({ method: "CANCEL" }) },
          },
        },
      ],
    });

    expect(summary.eventsUpdated).toBe(1);
    expect(prisma.calendarEvent.updateMany).toHaveBeenCalled();
  });

  it("updates matching existing events instead of duplicating them", async () => {
    const prisma = createPrismaMock();
    prisma.calendarEvent.findMany.mockResolvedValueOnce([
      createExistingEvent(),
    ]);
    const service = new MailCalendarIngestionService(prisma as never);

    const summary = await service.ingestIcsContent({
      userId: "user-1",
      icsContent: buildIcs({
        title: "Updated planning sync",
        description: "Updated agenda",
        location: "Room 42",
      }),
      attendeeStatus: "accepted",
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

  it("does not mirror pending ghost invitations into Stalwart until accepted", async () => {
    const prisma = createPrismaMock();
    const stalwartClient = createMockStalwartClient();
    prisma.mailDirectoryEntry.findUnique.mockResolvedValue({
      stalwartAccountId: "acct-1",
    });
    prisma.calendar.findFirst.mockResolvedValue(
      createOwnedCalendarMock({
        stalwartAccountId: "acct-1",
        stalwartCalendarId: "remote-cal-1",
      }),
    );
    const service = new MailCalendarIngestionService(
      prisma as never,
      undefined,
      stalwartClient,
    );

    await service.ingestIcsContent({
      userId: "user-1",
      icsContent: buildIcs({
        attendees: ["testingprod15@solace.onl"],
      }),
    });

    expect(stalwartClient.createEvent).not.toHaveBeenCalled();
    expect(prisma.calendarEvent.create).toHaveBeenCalled();
  });

  it("mirrors accepted invitations into Stalwart with scheduling messages", async () => {
    const prisma = createPrismaMock();
    const stalwartClient = createMockStalwartClient();
    prisma.mailDirectoryEntry.findUnique.mockResolvedValue({
      stalwartAccountId: "acct-1",
    });
    prisma.calendar.findFirst.mockResolvedValue(
      createOwnedCalendarMock({
        stalwartAccountId: "acct-1",
        stalwartCalendarId: "remote-cal-1",
      }),
    );
    const service = new MailCalendarIngestionService(
      prisma as never,
      undefined,
      stalwartClient,
    );

    await service.ingestIcsContent({
      userId: "user-1",
      icsContent: buildIcs({
        attendees: ["guest@solace.onl"],
      }),
      attendeeStatus: "accepted",
    });

    expect(stalwartClient.createEvent).toHaveBeenCalledWith({
      accountId: "acct-1",
      event: expect.objectContaining({
        calendarIds: { "remote-cal-1": true },
        uid: "invite-1@example.com",
        title: "Planning sync",
        participants: expect.objectContaining({
          p0: expect.objectContaining({
            participationStatus: "accepted",
            calendarAddress: "mailto:guest@solace.onl",
          }),
        }),
      }),
      sendSchedulingMessages: true,
    });
  });

  it("declines mailed invitations without creating a local event", async () => {
    const prisma = createPrismaMock();
    const stalwartClient = createMockStalwartClient();
    prisma.mailDirectoryEntry.findUnique.mockResolvedValue({
      stalwartAccountId: "acct-1",
    });
    prisma.calendar.findFirst.mockResolvedValue(
      createOwnedCalendarMock({
        stalwartAccountId: "acct-1",
        stalwartCalendarId: "remote-cal-1",
      }),
    );
    const service = new MailCalendarIngestionService(
      prisma as never,
      undefined,
      stalwartClient,
    );

    await expect(
      service.declineIcsInvitation({
        userId: "user-1",
        icsContent: buildIcs({
          attendees: ["guest@solace.onl"],
        }),
      }),
    ).resolves.toEqual({ declined: true });

    expect(prisma.calendarEvent.create).not.toHaveBeenCalled();
    expect(stalwartClient.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        sendSchedulingMessages: true,
      }),
    );
    expect(stalwartClient.deleteEvent).toHaveBeenCalled();
  });
});
