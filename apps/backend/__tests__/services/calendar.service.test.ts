import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../lib/user-setup", () => ({
  ensureUserCalendars: jest.fn(),
}));

import { ValidationError } from "../../lib/errors";
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
    createdAt: new Date("2026-04-24T10:00:00.000Z"),
    updatedAt: new Date("2026-04-24T10:00:00.000Z"),
    ...overrides,
  };
}

function createMockPrisma() {
  return {
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
    calendarEvent: {
      count: jest.fn(async () => 0),
      updateMany: jest.fn(async () => ({ count: 3 })),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
  };
}

describe("CalendarService", () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let service: CalendarService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new CalendarService(mockPrisma as never);
  });

  it("creates calendars with normalized names and encrypted metadata", async () => {
    const created = await service.create({
      userId: "user-1",
      name: "  Focus  ",
      color: "#abcdef",
      encryptedName: "ciphertext",
      blindIndexTokens: ["idx-1"],
      encryptionState: "shadow_write",
      encryptionKeyVersion: 2,
      forceFullEncryption: true,
    });

    expect(mockPrisma.calendar.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", name: "Focus" },
    });
    expect(mockPrisma.calendar.create).toHaveBeenCalledWith({
      data: {
        name: "Focus",
        color: "#abcdef",
        kind: "owned",
        isPublic: false,
        isVisible: true,
        isDefault: false,
        userId: "user-1",
        encryptedName: "ciphertext",
        blindIndexTokens: JSON.stringify(["idx-1"]),
        encryptionState: "shadow_write",
        encryptionKeyVersion: 2,
        forceFullEncryption: true,
      },
    });
    expect(created).toEqual(
      expect.objectContaining({
        name: "Focus",
        forceFullEncryption: true,
      }),
    );
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
});
