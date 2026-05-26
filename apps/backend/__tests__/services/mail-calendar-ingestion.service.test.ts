import { describe, expect, it, jest } from "@jest/globals";
import type { CalendarEvent } from "../../generated/prisma/index.js";
import { MailCalendarIngestionService } from "../../services/mail-calendar-ingestion.service";

type CalendarMockResult = {
  id: string;
  name: string;
  kind: string;
  isSyncOnly: boolean;
  forceFullEncryption: boolean;
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
        kind: "owned",
        isSyncOnly: false,
        forceFullEncryption: false,
      })),
      count: jest.fn(async () => 1),
      create: jest.fn(),
    },
    calendarEvent: {
      findMany: jest.fn<() => Promise<CalendarEvent[]>>(async () => []),
      create: jest.fn(async (input: unknown) => input),
      update: jest.fn(async (input: unknown) => input),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
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
      (email) => `ATTENDEE;CN=${email.split("@")[0]};PARTSTAT=NEEDS-ACTION:mailto:${email}`,
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
    userId: "user-1",
    calendarId: "calendar-1",
    categoryId: null,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("MailCalendarIngestionService", () => {
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
});
