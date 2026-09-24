import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../lib/user-setup", () => ({
  ensureUserCalendars: jest.fn(),
}));

import { MAIL_INVITATION_STAGING_CALENDAR_NAME } from "@workspace/calendar-core";
import { ValidationError } from "../../lib/errors";
import { excludeInvitationStagingCalendarWhere } from "../../lib/mail-invitation-calendar";
import { CalendarService } from "../../services/calendar.service";

type CalendarFixtureInput = Partial<{
  id: string;
  name: string;
  color: string;
  kind: "owned" | "subscribed" | "public";
  isPublic: boolean;
  isVisible: boolean;
  isDefault: boolean;
  forceFullEncryption: boolean;
  userId: string;
  encryptedName: string | null;
  blindIndexTokens: string | null;
  encryptionState: "plaintext" | "shadow_write" | "encrypted";
  encryptionKeyVersion: number | null;
  isSyncOnly: boolean;
  stalwartAccountId: string | null;
  stalwartCalendarId: string | null;
  stalwartSyncedAt: Date | null;
}>;

function calendarFixture(overrides: CalendarFixtureInput = {}) {
  return {
    id: "calendar-1",
    name: "Work",
    color: "blue",
    kind: "owned" as const,
    isPublic: false,
    isVisible: true,
    isDefault: false,
    forceFullEncryption: false,
    userId: "user-1",
    encryptedName: null,
    blindIndexTokens: null,
    encryptionState: "plaintext" as const,
    encryptionKeyVersion: 1,
    isSyncOnly: false,
    stalwartAccountId: null,
    stalwartCalendarId: null,
    stalwartSyncedAt: null,
    createdAt: new Date("2026-04-24T10:00:00.000Z"),
    updatedAt: new Date("2026-04-24T10:00:00.000Z"),
    ...overrides,
  };
}

function createMockPrisma() {
  const prisma = {
    calendar: {
      findMany: jest.fn<() => Promise<any[]>>(async () => []),
      findFirst: jest.fn<() => Promise<any | null>>(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
        calendarFixture(data),
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => calendarFixture({ id: where.id, ...data }),
      ),
      updateMany: jest.fn(async () => ({ count: 0 })),
      delete: jest.fn(async () => calendarFixture()),
      count: jest.fn(async () => 2),
    },
    mailDirectoryEntry: {
      findUnique: jest.fn<() => Promise<{ stalwartAccountId: string } | null>>(
        async () => null,
      ),
    },
    userEncryptionDevice: {
      count: jest.fn(async () => 0),
    },
    calendarEvent: {
      count: jest.fn(async () => 0),
      findMany: jest.fn(async () => []),
      updateMany: jest.fn(async () => ({ count: 3 })),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
  };

  return {
    ...prisma,
    $transaction: jest.fn(
      async (callback: (tx: typeof prisma) => Promise<any>) => callback(prisma),
    ),
  };
}

function createMockStalwartClient() {
  return {
    listCalendars: jest.fn(async () => []),
    createCalendar: jest.fn(async () => ({ id: "stalwart-calendar-1" })),
    updateCalendar: jest.fn(async () => undefined),
    deleteCalendar: jest.fn(async () => undefined),
    queryEventIds: jest.fn(async () => []),
    getEvents: jest.fn(async () => []),
    createEvent: jest.fn(async () => ({ id: "stalwart-event-1" })),
    updateEvent: jest.fn(async () => undefined),
    deleteEvent: jest.fn(async () => undefined),
    listAddressBooks: jest.fn(async () => []),
    createContactCard: jest.fn(async () => ({ id: "contact-1" })),
  };
}

describe("CalendarService", () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let service: CalendarService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new CalendarService(mockPrisma as never);
  });

  it("creates encrypted calendars without persisting the plaintext name", async () => {
    const created = await service.create({
      userId: "user-1",
      color: "#abcdef",
      encryptedName: "ciphertext",
      blindIndexTokens: ["idx-1"],
      encryptionState: "shadow_write",
      encryptionKeyVersion: 2,
      forceFullEncryption: true,
    });

    expect(mockPrisma.calendar.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.calendar.create).toHaveBeenCalledWith({
      data: {
        name: "",
        color: "#abcdef",
        kind: "owned",
        isPublic: false,
        isVisible: true,
        isDefault: false,
        userId: "user-1",
        encryptedName: "ciphertext",
        blindIndexTokens: JSON.stringify(["idx-1"]),
        encryptionState: "encrypted",
        encryptionKeyVersion: 2,
        forceFullEncryption: true,
      },
    });
    expect(created).toEqual(
      expect.objectContaining({
        name: "",
        encryptionState: "encrypted",
        forceFullEncryption: true,
      }),
    );
  });

  it("rejects plaintext names sent alongside ciphertext", async () => {
    await expect(
      service.create({
        userId: "user-1",
        name: "Therapy",
        color: "#abcdef",
        encryptedName: "ciphertext",
      }),
    ).rejects.toMatchObject({
      name: "ValidationError",
      field: "name",
    } as Partial<ValidationError>);
    expect(mockPrisma.calendar.create).not.toHaveBeenCalled();
  });

  it("normalizes plaintext names for accounts without E2EE", async () => {
    await service.create({
      userId: "user-1",
      name: "  Focus  ",
      color: "#abcdef",
    });

    expect(mockPrisma.calendar.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", name: "Focus" },
    });
    expect(mockPrisma.calendar.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Focus",
        encryptedName: null,
        blindIndexTokens: null,
        encryptionState: "plaintext",
      }),
    });
  });

  it("rejects plaintext names once the account has an E2EE device", async () => {
    mockPrisma.userEncryptionDevice.count.mockResolvedValue(1);

    await expect(
      service.create({ userId: "user-1", name: "Therapy", color: "#abcdef" }),
    ).rejects.toMatchObject({
      name: "ValidationError",
      field: "encryptedName",
    } as Partial<ValidationError>);
    expect(mockPrisma.calendar.create).not.toHaveBeenCalled();
  });

  it("blanks the plaintext name when a backfill uploads ciphertext", async () => {
    const stalwartClient = createMockStalwartClient();
    mockPrisma.mailDirectoryEntry.findUnique.mockResolvedValue({
      stalwartAccountId: "acct-1",
    });
    mockPrisma.calendar.findFirst.mockResolvedValueOnce(
      calendarFixture({
        name: "Therapy",
        stalwartAccountId: "acct-1",
        stalwartCalendarId: "remote-cal-1",
      }),
    );
    service = new CalendarService(mockPrisma as never);

    await service.update({
      userId: "user-1",
      calendarId: "calendar-1",
      encryptedName: "ciphertext",
      blindIndexTokens: ["idx-1"],
      encryptionKeyVersion: 1,
    });

    expect(mockPrisma.userEncryptionDevice.count).not.toHaveBeenCalled();
    expect(mockPrisma.calendar.update).toHaveBeenCalledWith({
      where: { id: "calendar-1" },
      data: expect.objectContaining({
        name: "",
        encryptedName: "ciphertext",
        blindIndexTokens: JSON.stringify(["idx-1"]),
        encryptionState: "encrypted",
        encryptionKeyVersion: 1,
      }),
    });
  });

  it("allows visibility-only updates on subscribed calendars", async () => {
    mockPrisma.calendar.findFirst.mockResolvedValue(
      calendarFixture({ kind: "subscribed", isVisible: true }),
    );
    mockPrisma.calendar.update.mockResolvedValue(
      calendarFixture({ kind: "subscribed", isVisible: false }),
    );

    const updated = await service.update({
      userId: "user-1",
      calendarId: "calendar-1",
      isVisible: false,
    });

    expect(mockPrisma.calendar.update).toHaveBeenCalledWith({
      where: { id: "calendar-1" },
      data: expect.objectContaining({
        isVisible: false,
        updatedAt: expect.any(Date),
      }),
    });
    expect(updated).toEqual(
      expect.objectContaining({ kind: "subscribed", isVisible: false }),
    );
  });

  it("backfills encrypted events when forceFullEncryption is enabled", async () => {
    mockPrisma.calendar.findFirst.mockResolvedValue(
      calendarFixture({ forceFullEncryption: false }),
    );
    mockPrisma.calendar.update.mockResolvedValue(
      calendarFixture({ forceFullEncryption: true }),
    );

    await service.update({
      userId: "user-1",
      calendarId: "calendar-1",
      forceFullEncryption: true,
    });

    expect(mockPrisma.calendarEvent.updateMany).toHaveBeenCalledWith({
      where: {
        calendarId: "calendar-1",
        userId: "user-1",
        encryptedContent: { not: null },
      },
      data: {
        title: "",
        description: null,
        location: null,
        encryptionState: "encrypted",
      },
    });
  });

  it("prevents deleting the last editable calendar", async () => {
    mockPrisma.calendar.findFirst.mockResolvedValue(calendarFixture());
    mockPrisma.calendar.count.mockResolvedValue(1);

    await expect(
      service.delete({
        userId: "user-1",
        calendarId: "calendar-1",
      }),
    ).rejects.toMatchObject({
      name: "ValidationError",
      field: "calendarId",
      message:
        "Cannot delete the last editable calendar. Create another calendar first.",
    } as Partial<ValidationError>);
    expect(mockPrisma.calendar.delete).not.toHaveBeenCalled();
  });

  it("refuses to make the invitations staging calendar the default", async () => {
    mockPrisma.calendar.findFirst.mockResolvedValue(
      calendarFixture({
        name: MAIL_INVITATION_STAGING_CALENDAR_NAME,
        isVisible: false,
      }),
    );

    await expect(
      service.update({
        userId: "user-1",
        calendarId: "calendar-1",
        isDefault: true,
      }),
    ).rejects.toMatchObject({
      name: "ValidationError",
      field: "isDefault",
    } as Partial<ValidationError>);
    expect(mockPrisma.calendar.update).not.toHaveBeenCalled();
    expect(mockPrisma.calendar.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to move events into the invitations staging calendar", async () => {
    mockPrisma.calendar.findFirst
      .mockResolvedValueOnce(calendarFixture())
      .mockResolvedValueOnce(
        calendarFixture({
          id: "invitations-cal-1",
          name: MAIL_INVITATION_STAGING_CALENDAR_NAME,
          isVisible: false,
        }),
      );
    mockPrisma.calendarEvent.count.mockResolvedValue(2);

    await expect(
      service.delete({
        userId: "user-1",
        calendarId: "calendar-1",
        action: "move_events",
        targetCalendarId: "invitations-cal-1",
      }),
    ).rejects.toMatchObject({
      name: "ValidationError",
      field: "targetCalendarId",
    } as Partial<ValidationError>);
    expect(mockPrisma.calendarEvent.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.calendar.delete).not.toHaveBeenCalled();
  });

  it("never promotes the staging calendar when deleting the default", async () => {
    mockPrisma.calendar.findFirst
      .mockResolvedValueOnce(calendarFixture({ isDefault: true }))
      .mockResolvedValueOnce(calendarFixture({ id: "calendar-2" }));

    await service.delete({ userId: "user-1", calendarId: "calendar-1" });

    expect(mockPrisma.calendar.count).toHaveBeenCalledWith({
      where: expect.objectContaining(excludeInvitationStagingCalendarWhere),
    });
    expect(mockPrisma.calendar.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          kind: "owned",
          isSyncOnly: false,
          ...excludeInvitationStagingCalendarWhere,
        }),
      }),
    );
    expect(mockPrisma.calendar.update).toHaveBeenCalledWith({
      where: { id: "calendar-2" },
      data: { isDefault: true },
    });
  });

  it("lists local calendars without syncing remote Stalwart calendars", async () => {
    const stalwartClient = createMockStalwartClient();
    const localCalendar = calendarFixture({
      stalwartAccountId: "acct-1",
      stalwartCalendarId: "remote-cal-1",
    });
    mockPrisma.calendar.findMany.mockResolvedValueOnce([
      localCalendar,
    ] as never);
    service = new CalendarService(mockPrisma as never);

    const result = await service.list("user-1");

    expect(stalwartClient.listCalendars).not.toHaveBeenCalled();
    expect(mockPrisma.calendar.create).not.toHaveBeenCalled();
    expect(mockPrisma.calendar.update).not.toHaveBeenCalled();
    expect(result).toEqual({ calendars: [localCalendar] });
  });
});
