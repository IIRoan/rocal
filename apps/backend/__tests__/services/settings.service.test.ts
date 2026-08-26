import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../lib/event-encryption", () => ({
  backfillEncryptedEventsToCiphertextOnly: jest.fn(async () => 2),
  normalizeEventEncryptionMode: jest.fn((value?: string | null) =>
    value === "full" ? "full" : "hybrid",
  ),
}));

import {
  backfillEncryptedEventsToCiphertextOnly,
  normalizeEventEncryptionMode,
} from "../../lib/event-encryption";
import { ValidationError } from "../../lib/errors";
import { SettingsService } from "../../services/settings.service";

type SettingsFixtureInput = Partial<{
  userId: string;
  theme: "light" | "dark" | "system";
  defaultView: "month" | "week" | "day" | "agenda";
  weekStartDay: number;
  timezone: string;
  timeFormat: "12h" | "24h";
  workingHoursStart: number;
  workingHoursEnd: number;
  workingDays: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
  browserNotifications: boolean;
  reminderSound: boolean;
  eventEncryptionMode: "hybrid" | "full";
  defaultEventDuration: number;
  defaultCalendarId: string | null;
  compactView: boolean;
  showWeekNumbers: boolean;
  showDeclinedEvents: boolean;
  defaultReminder: number | null;
}>;

function settingsFixture(overrides: SettingsFixtureInput = {}) {
  return {
    userId: "user-1",
    theme: "system" as const,
    defaultView: "month" as const,
    weekStartDay: 1,
    timezone: "UTC",
    timeFormat: "24h" as const,
    workingHoursStart: 9,
    workingHoursEnd: 17,
    workingDays: "[1,2,3,4,5]",
    emailNotifications: true,
    pushNotifications: true,
    browserNotifications: true,
    reminderSound: true,
    eventEncryptionMode: "hybrid" as const,
    defaultEventDuration: 30,
    defaultCalendarId: null,
    compactView: false,
    showWeekNumbers: false,
    showDeclinedEvents: true,
    defaultReminder: null,
    createdAt: new Date("2026-04-24T10:00:00.000Z"),
    updatedAt: new Date("2026-04-24T10:00:00.000Z"),
    ...overrides,
  };
}

type MockSettingsTransaction = {
  calendar: {
    findMany: jest.Mock<() => Promise<any[]>>;
    updateMany: jest.Mock<() => Promise<{ count: number }>>;
  };
  userSettings: {
    upsert: jest.Mock<
      ({
        create,
        update,
      }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => Promise<any>
    >;
  };
  calendarEvent: {
    updateMany: jest.Mock<() => Promise<{ count: number }>>;
  };
};

function createMockPrisma() {
  const tx: MockSettingsTransaction = {
    calendar: {
      findMany: jest.fn<() => Promise<any[]>>(async () => []),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    userSettings: {
      upsert: jest.fn(
        async ({
          create,
          update,
        }: {
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => settingsFixture({ ...create, ...update }),
      ),
    },
    calendarEvent: {
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
  };

  const prisma = {
    userSettings: {
      findUnique: jest.fn<() => Promise<any | null>>(async () =>
        settingsFixture(),
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
        settingsFixture(data),
      ),
      upsert: jest.fn(
        async ({
          create,
          update,
        }: {
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => settingsFixture({ ...create, ...update }),
      ),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    calendar: {
      findFirst: jest.fn<() => Promise<any | null>>(async () => null),
    },
    calendarEvent: {
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    $transaction: jest.fn(
      async (callback: (tx: MockSettingsTransaction) => Promise<any>) =>
        callback(tx),
    ),
  };

  return { prisma, tx };
}

const mockBackfillEncryptedEventsToCiphertextOnly =
  backfillEncryptedEventsToCiphertextOnly as jest.MockedFunction<
    typeof backfillEncryptedEventsToCiphertextOnly
  >;
const mockNormalizeEventEncryptionMode =
  normalizeEventEncryptionMode as jest.MockedFunction<
    typeof normalizeEventEncryptionMode
  >;

describe("SettingsService", () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let service: SettingsService;

  beforeEach(() => {
    mockBackfillEncryptedEventsToCiphertextOnly.mockClear();
    mockNormalizeEventEncryptionMode.mockClear();
    mockPrisma = createMockPrisma();
    service = new SettingsService(mockPrisma.prisma as never);
  });

  it("creates default settings when a user has none", async () => {
    mockPrisma.prisma.userSettings.findUnique.mockResolvedValue(null);
    mockPrisma.prisma.userSettings.create.mockResolvedValue(
      settingsFixture({ userId: "user-1" }),
    );

    const settings = await service.get("user-1");

    expect(mockPrisma.prisma.userSettings.create).toHaveBeenCalledWith({
      data: { userId: "user-1" },
    });
    expect(settings).toEqual(
      expect.objectContaining({
        userId: "user-1",
        timezone: "UTC",
      }),
    );
    expect(settings).not.toHaveProperty("defaultReminder");
  });

  it("rejects invalid timezone identifiers", async () => {
    await expect(
      service.update({
        userId: "user-1",
        timezone: "Mars/Olympus_Mons",
      }),
    ).rejects.toMatchObject({
      name: "ValidationError",
      field: "timezone",
      message: "Invalid timezone identifier",
    } as Partial<ValidationError>);
  });

  it("rejects non-owned calendars as the default calendar", async () => {
    mockPrisma.prisma.calendar.findFirst.mockResolvedValue({
      id: "calendar-1",
      userId: "user-1",
      kind: "subscribed",
    });

    await expect(
      service.update({
        userId: "user-1",
        defaultCalendarId: "calendar-1",
      }),
    ).rejects.toMatchObject({
      name: "ValidationError",
      field: "defaultCalendarId",
      message: "The default calendar must be one of your editable calendars.",
    } as Partial<ValidationError>);
  });

  it("disables calendar sharing and backfills shared calendars when switching to full encryption", async () => {
    mockPrisma.tx.calendar.findMany.mockResolvedValue([
      { id: "calendar-1" },
      { id: "calendar-2" },
    ]);
    mockPrisma.tx.userSettings.upsert.mockResolvedValue(
      settingsFixture({ eventEncryptionMode: "full" }),
    );

    const settings = await service.update({
      userId: "user-1",
      eventEncryptionMode: "full",
    });

    expect(mockNormalizeEventEncryptionMode).toHaveBeenCalledWith("full");
    expect(mockPrisma.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.tx.calendar.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", icsShareEnabled: true },
      data: {
        icsShareEnabled: false,
        icsShareToken: null,
        updatedAt: expect.any(Date),
      },
    });
    expect(mockBackfillEncryptedEventsToCiphertextOnly).toHaveBeenCalledWith(
      mockPrisma.tx,
      {
        userId: "user-1",
        calendarIds: ["calendar-1", "calendar-2"],
        now: expect.any(Date),
      },
    );
    expect(settings).toEqual(
      expect.objectContaining({ eventEncryptionMode: "full" }),
    );
    expect(settings).not.toHaveProperty("defaultReminder");
  });
});
