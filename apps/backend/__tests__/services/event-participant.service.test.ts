import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../lib/auth-email", () => ({
  buildEventInvitationEmail: jest.fn(() => ({
    subject: "Invite",
    text: "Invite text",
    html: "<p>Invite</p>",
  })),
  sendAuthEmail: jest.fn(async () => ({ delivered: true, channel: "resend" })),
}));

jest.mock("../../lib/event-invitation-delivery", () => ({
  sendEventInvitationEmail: jest.fn(async () => ({
    delivered: true,
    channel: "resend",
  })),
}));

jest.mock("../../lib/email-client", () => ({
  resend: {
    emails: {
      send: jest.fn(async () => ({ data: { id: "email-1" } })),
    },
  },
  authEmailFrom: "Solace <test@example.com>",
}));

import { sendEventInvitationEmail } from "../../lib/event-invitation-delivery";
import { EventParticipantService } from "../../services/event-participant.service";

const mockSendEventInvitationEmail = sendEventInvitationEmail as jest.MockedFunction<
  typeof sendEventInvitationEmail
>;
type MockUserRecord = {
  id: string;
  email: string;
  name: string;
};

type MockDirectoryRecord = {
  email: string;
  userId: string | null;
  stalwartAccountId?: string;
};

type MockParticipantRecord = {
  id: string;
  eventId: string;
  userId: string | null;
  email: string;
  displayName: string | null;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    email: string;
    name: string;
    image: string | null;
  } | null;
};

describe("EventParticipantService", () => {
  beforeEach(() => {
    mockSendEventInvitationEmail.mockClear();
    mockSendEventInvitationEmail.mockResolvedValue({
      delivered: true,
      channel: "resend",
    });
  });

  it("adds the organizer, upserts attendees, and sends invitation mail for new invitees", async () => {
    const prisma = {
      user: {
        findUnique: jest
          .fn<(...args: unknown[]) => Promise<MockUserRecord | null>>()
          .mockResolvedValueOnce({
            id: "user-1",
            email: "owner@example.com",
            name: "Owner",
          })
          .mockResolvedValueOnce({
            id: "user-1",
            email: "owner@example.com",
            name: "Owner",
          }),
        findMany: jest
          .fn<(...args: unknown[]) => Promise<MockUserRecord[]>>()
          .mockResolvedValue([
            {
              id: "user-2",
              email: "teammate@example.com",
              name: "Teammate",
            },
          ]),
      },
      mailDirectoryEntry: {
        findMany: jest
          .fn<(...args: unknown[]) => Promise<MockDirectoryRecord[]>>()
          .mockResolvedValue([]),
        findUnique: jest.fn(async () => null),
      },
      eventParticipant: {
        findMany: jest
          .fn<(...args: unknown[]) => Promise<MockParticipantRecord[]>>()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              id: "participant-owner",
              eventId: "event-1",
              userId: "user-1",
              email: "owner@example.com",
              displayName: "Owner",
              role: "organizer",
              status: "accepted",
              createdAt: new Date("2026-05-01T09:00:00.000Z"),
              updatedAt: new Date("2026-05-01T09:00:00.000Z"),
              user: {
                id: "user-1",
                email: "owner@example.com",
                name: "Owner",
                image: null,
              },
            },
            {
              id: "participant-attendee",
              eventId: "event-1",
              userId: "user-2",
              email: "teammate@example.com",
              displayName: "Teammate",
              role: "attendee",
              status: "pending",
              createdAt: new Date("2026-05-01T09:00:00.000Z"),
              updatedAt: new Date("2026-05-01T09:00:00.000Z"),
              user: {
                id: "user-2",
                email: "teammate@example.com",
                name: "Teammate",
                image: "https://example.com/avatar.png",
              },
            },
          ]),
        deleteMany: jest.fn(async () => ({ count: 0 })),
        upsert: jest.fn(async () => null),
      },
    };

    const service = new EventParticipantService(prisma as never);

    const result = await service.syncParticipants({
      eventId: "event-1",
      ownerUserId: "user-1",
      participants: [
        {
          email: "teammate@example.com",
          status: "pending",
        },
      ],
      sendInvitations: true,
      calendarName: "Primary",
      invitationEvent: {
        uid: "event-1@solace-calendar.local",
        title: "Planning sync",
        start: new Date("2026-05-02T10:00:00.000Z"),
        end: new Date("2026-05-02T11:00:00.000Z"),
        allDay: false,
        timezone: "UTC",
      },
    });
    await result.sendPendingInvitations();

    expect(prisma.eventParticipant.upsert).toHaveBeenCalledTimes(2);
    expect(mockSendEventInvitationEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEventInvitationEmail.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        to: "teammate@example.com",
        message: expect.objectContaining({
          attachments: [
            expect.objectContaining({
              filename: "invite.ics",
            }),
          ],
        }),
      }),
    );
    expect(result.participants).toEqual([
      expect.objectContaining({
        email: "owner@example.com",
        role: "organizer",
      }),
      expect.objectContaining({
        email: "teammate@example.com",
        image: "https://example.com/avatar.png",
        role: "attendee",
      }),
    ]);
  });

  it("removes participants that are no longer in the updated list", async () => {
    const existingParticipants: MockParticipantRecord[] = [
      {
        id: "participant-owner",
        eventId: "event-1",
        userId: "user-1",
        email: "owner@example.com",
        displayName: "Owner",
        role: "organizer",
        status: "accepted",
        createdAt: new Date("2026-05-01T09:00:00.000Z"),
        updatedAt: new Date("2026-05-01T09:00:00.000Z"),
        user: {
          id: "user-1",
          email: "owner@example.com",
          name: "Owner",
          image: null,
        },
      },
      {
        id: "participant-attendee",
        eventId: "event-1",
        userId: "user-2",
        email: "removed@example.com",
        displayName: "Removed",
        role: "attendee",
        status: "pending",
        createdAt: new Date("2026-05-01T09:00:00.000Z"),
        updatedAt: new Date("2026-05-01T09:00:00.000Z"),
        user: {
          id: "user-2",
          email: "removed@example.com",
          name: "Removed",
          image: null,
        },
      },
    ];

    const prisma = {
      user: {
        findUnique: jest
          .fn<(...args: unknown[]) => Promise<MockUserRecord | null>>()
          .mockResolvedValue({
            id: "user-1",
            email: "owner@example.com",
            name: "Owner",
          }),
        findMany: jest
          .fn<(...args: unknown[]) => Promise<MockUserRecord[]>>()
          .mockResolvedValue([]),
      },
      mailDirectoryEntry: {
        findMany: jest.fn(async () => []),
        findUnique: jest.fn(async () => null),
      },
      eventParticipant: {
        findMany: jest
          .fn<(...args: unknown[]) => Promise<MockParticipantRecord[]>>()
          .mockResolvedValueOnce(existingParticipants)
          .mockResolvedValueOnce([existingParticipants[0]!]),
        deleteMany: jest.fn(async () => ({ count: 1 })),
        upsert: jest.fn(async () => null),
      },
    };

    const service = new EventParticipantService(prisma as never);

    const result = await service.syncParticipants({
      eventId: "event-1",
      ownerUserId: "user-1",
      participants: [],
    });
    await result.sendPendingInvitations();

    expect(prisma.eventParticipant.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          email: { in: ["removed@example.com"] },
        }),
      }),
    );
    expect(result.changed).toBe(true);
  });

  it("deletes stale participants when an event is updated to an empty attendee list", async () => {
    const existingParticipants: MockParticipantRecord[] = [
      {
        id: "participant-attendee",
        eventId: "event-1",
        userId: "user-2",
        email: "removed@example.com",
        displayName: "Removed",
        role: "attendee",
        status: "pending",
        createdAt: new Date("2026-05-01T09:00:00.000Z"),
        updatedAt: new Date("2026-05-01T09:00:00.000Z"),
        user: {
          id: "user-2",
          email: "removed@example.com",
          name: "Removed",
          image: null,
        },
      },
    ];

    const prisma = {
      user: {
        findUnique:
          jest.fn<(...args: unknown[]) => Promise<MockUserRecord | null>>(),
        findMany: jest
          .fn<(...args: unknown[]) => Promise<MockUserRecord[]>>()
          .mockResolvedValue([]),
      },
      mailDirectoryEntry: {
        findMany: jest.fn(async () => []),
        findUnique: jest.fn(async () => null),
      },
      eventParticipant: {
        findMany: jest
          .fn<(...args: unknown[]) => Promise<MockParticipantRecord[]>>()
          .mockResolvedValueOnce(existingParticipants)
          .mockResolvedValueOnce([]),
        deleteMany: jest.fn(async () => ({ count: 1 })),
        upsert: jest.fn(async () => null),
      },
    };

    const service = new EventParticipantService(prisma as never);

    const result = await service.syncParticipants({
      eventId: "event-1",
      participants: [],
    });

    expect(prisma.eventParticipant.deleteMany).toHaveBeenCalledWith({
      where: {
        eventId: "event-1",
        email: { in: ["removed@example.com"] },
      },
    });
    expect(result.participants).toEqual([]);
    expect(result.changed).toBe(true);
  });

  it("links @solace.onl participants via mail directory and sends to the same address", async () => {
    const prisma = {
      user: {
        findUnique: jest
          .fn<(...args: unknown[]) => Promise<MockUserRecord | null>>()
          .mockResolvedValue({
            id: "user-bob",
            email: "bob@gmail.com",
            name: "Bob",
          }),
        findMany: jest
          .fn<(...args: unknown[]) => Promise<MockUserRecord[]>>()
          .mockResolvedValue([]),
      },
      mailDirectoryEntry: {
        findMany: jest
          .fn<(...args: unknown[]) => Promise<MockDirectoryRecord[]>>()
          .mockResolvedValue([
            {
              email: "roan@solace.onl",
              userId: "user-roan",
              stalwartAccountId: "acct-roan",
            },
          ]),
        findUnique: jest.fn(async () => ({
          stalwartAccountId: "acct-roan",
        })),
      },
      eventParticipant: {
        findMany: jest
          .fn<(...args: unknown[]) => Promise<MockParticipantRecord[]>>()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              id: "participant-attendee",
              eventId: "event-1",
              userId: "user-roan",
              email: "roan@solace.onl",
              displayName: "roan@solace.onl",
              role: "attendee",
              status: "pending",
              createdAt: new Date("2026-05-01T09:00:00.000Z"),
              updatedAt: new Date("2026-05-01T09:00:00.000Z"),
              user: null,
            },
          ]),
        deleteMany: jest.fn(async () => ({ count: 0 })),
        upsert: jest.fn(async () => null),
      },
    };

    const service = new EventParticipantService(prisma as never);

    const result = await service.syncParticipants({
      eventId: "event-1",
      ownerUserId: "user-bob",
      participants: [{ email: "roan@solace.onl", status: "pending" }],
      sendInvitations: true,
      calendarName: "Primary",
      invitationEvent: {
        uid: "event-1@solace-calendar.local",
        title: "Sync",
        start: new Date("2026-05-02T10:00:00.000Z"),
        end: new Date("2026-05-02T11:00:00.000Z"),
        allDay: false,
        timezone: "UTC",
      },
    });
    await result.sendPendingInvitations();

    expect(mockSendEventInvitationEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEventInvitationEmail.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        to: "roan@solace.onl",
      }),
    );
    expect(prisma.eventParticipant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          email: "roan@solace.onl",
          userId: "user-roan",
        }),
      }),
    );
    expect(result.participants[0]).toEqual(
      expect.objectContaining({
        email: "roan@solace.onl",
        userId: "user-roan",
      }),
    );
  });
});
