import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../lib/notification-calculator", () => ({
  NotificationCalculator: {
    buildNotificationSchedule: jest.fn(),
  },
}));

import { NotificationCalculator } from "../../lib/notification-calculator";
import { NotificationService } from "../../services/notification.service";

type EventFixtureInput = Partial<{
  id: string;
  start: Date;
  timezone: string;
  title: string;
  description: string | null;
  location: string | null;
  calendarId: string;
  reminder: number | null;
  encryptedContent: string | null;
  encryptionState: "plaintext" | "shadow_write" | "encrypted";
  isSynced: boolean;
}>;

function eventFixture(overrides: EventFixtureInput = {}) {
  return {
    id: "event-1",
    start: new Date("2026-12-01T12:30:00.000Z"),
    timezone: "UTC",
    title: "Planning",
    description: "Discuss roadmap",
    location: "Room 7",
    calendarId: "cal-1",
    reminder: 15,
    encryptedContent: "ciphertext",
    encryptionState: "shadow_write" as const,
    isSynced: false,
    ...overrides,
  };
}

function createHarness(
  options: Partial<{
    event: ReturnType<typeof eventFixture>;
    calendar: {
      id: string;
      icsShareEnabled: boolean;
      forceFullEncryption: boolean;
    };
    settings: { eventEncryptionMode: "hybrid" | "full" } | null;
  }> = {},
) {
  const prisma = {
    calendarEvent: {
      findFirst: jest.fn<() => Promise<any>>(),
      update: jest.fn<() => Promise<any>>(),
    },
    eventNotification: {
      deleteMany: jest.fn<() => Promise<{ count: number }>>(),
    },
    calendar: {
      findFirst: jest.fn<() => Promise<any>>(),
    },
    userSettings: {
      findUnique: jest.fn<() => Promise<any>>(),
    },
    $executeRaw: jest.fn(async (): Promise<number> => 1),
  };

  prisma.calendarEvent.findFirst.mockResolvedValue(
    options.event ?? eventFixture(),
  );
  prisma.calendarEvent.update.mockResolvedValue({ id: "event-1" });
  prisma.eventNotification.deleteMany.mockResolvedValue({ count: 1 });
  prisma.calendar.findFirst.mockResolvedValue(
    options.calendar ?? {
      id: "cal-1",
      icsShareEnabled: false,
      forceFullEncryption: false,
    },
  );
  prisma.userSettings.findUnique.mockResolvedValue(
    options.settings ?? { eventEncryptionMode: "hybrid" },
  );

  return {
    prisma,
    service: new NotificationService(prisma as never),
  };
}

const mockBuildNotificationSchedule =
  NotificationCalculator.buildNotificationSchedule as jest.Mock;

describe("NotificationService encryption transitions", () => {
  beforeEach(() => {
    mockBuildNotificationSchedule.mockReset();
    mockBuildNotificationSchedule.mockReturnValue({
      notificationTime: new Date("2026-12-01T12:20:00.000Z"),
      notificationDateLocal: "2026-12-01T12:20:00",
      notificationTimezone: "UTC",
    });
  });

  it("moves hybrid events into shadow_write when an email reminder is added", async () => {
    const { prisma, service } = createHarness({
      event: eventFixture({ reminder: null }),
    });

    await service.setForEvent("user-1", "event-1", [
      {
        notificationType: "email",
        minutesBefore: 10,
        isEnabled: true,
      },
    ]);

    expect(prisma.calendarEvent.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: expect.objectContaining({
        reminder: 10,
        encryptionState: "shadow_write",
        title: "Planning",
        description: "Discuss roadmap",
        location: "Room 7",
      }),
    });
  });

  it("uses the earliest remaining reminder when encrypted events keep multiple email reminders", async () => {
    const { prisma, service } = createHarness({
      event: eventFixture({ reminder: 15 }),
    });

    await service.setForEvent("user-1", "event-1", [
      {
        notificationType: "email",
        minutesBefore: 30,
        isEnabled: true,
      },
      {
        notificationType: "email",
        minutesBefore: 60,
        isEnabled: true,
      },
    ]);

    expect(prisma.calendarEvent.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: expect.objectContaining({
        reminder: 30,
        encryptionState: "shadow_write",
        title: "Planning",
        description: "Discuss roadmap",
        location: "Room 7",
      }),
    });
    expect(prisma.eventNotification.deleteMany).toHaveBeenCalledWith({
      where: { eventId: "event-1" },
    });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it("keeps plaintext events plaintext when multiple reminders are updated", async () => {
    const { prisma, service } = createHarness({
      event: eventFixture({
        encryptedContent: null,
        encryptionState: "plaintext",
        reminder: null,
      }),
    });

    await service.setForEvent("user-1", "event-1", [
      {
        notificationType: "email",
        minutesBefore: 15,
        isEnabled: true,
      },
      {
        notificationType: "email",
        minutesBefore: 45,
        isEnabled: true,
      },
    ]);

    expect(prisma.calendarEvent.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: expect.objectContaining({
        reminder: 15,
        encryptionState: "plaintext",
        title: "Planning",
        description: "Discuss roadmap",
        location: "Room 7",
      }),
    });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it("keeps share-backed hybrid rows readable when only non-email notifications remain", async () => {
    const { prisma, service } = createHarness({
      event: eventFixture({ reminder: 15 }),
      calendar: {
        id: "cal-1",
        icsShareEnabled: true,
        forceFullEncryption: false,
      },
    });

    await service.setForEvent("user-1", "event-1", [
      {
        notificationType: "browser",
        minutesBefore: 5,
        isEnabled: true,
      },
    ]);

    expect(prisma.calendarEvent.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: expect.objectContaining({
        reminder: null,
        encryptionState: "shadow_write",
        title: "Planning",
        description: "Discuss roadmap",
        location: "Room 7",
      }),
    });
  });

  it("rejects enabling email reminders on ciphertext-only hybrid events", async () => {
    const { service } = createHarness({
      event: eventFixture({
        title: "",
        description: null,
        location: null,
        reminder: null,
        encryptionState: "encrypted",
      }),
    });

    await expect(
      service.setForEvent("user-1", "event-1", [
        {
          notificationType: "email",
          minutesBefore: 15,
          isEnabled: true,
        },
      ]),
    ).rejects.toThrow(
      "This event is stored as ciphertext only, so the server can't attach reminder details to it. Open the event in a signed-in client and save it again to switch it to hybrid encryption before enabling email reminders.",
    );
  });

  it("keeps ciphertext-only storage when a calendar forces full encryption", async () => {
    const { prisma, service } = createHarness({
      event: eventFixture({
        title: "",
        description: null,
        location: null,
        reminder: null,
        encryptionState: "encrypted",
      }),
      calendar: {
        id: "cal-1",
        icsShareEnabled: false,
        forceFullEncryption: true,
      },
    });

    await service.setForEvent("user-1", "event-1", [
      {
        notificationType: "email",
        minutesBefore: 15,
        isEnabled: true,
      },
    ]);

    expect(prisma.calendarEvent.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: expect.objectContaining({
        reminder: 15,
        encryptionState: "encrypted",
        title: "",
        description: null,
        location: null,
      }),
    });
  });

  it("re-encrypts hybrid events when the last reminder is removed", async () => {
    const { prisma, service } = createHarness({
      event: eventFixture({ reminder: 15 }),
    });

    await service.deleteForEvent("user-1", "event-1");

    expect(prisma.eventNotification.deleteMany).toHaveBeenCalledWith({
      where: { eventId: "event-1" },
    });
    expect(prisma.calendarEvent.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: expect.objectContaining({
        reminder: null,
        encryptionState: "encrypted",
        title: "",
        description: null,
        location: null,
      }),
    });
  });

  it("preserves shadow_write after reminder removal when sharing still needs plaintext", async () => {
    const { prisma, service } = createHarness({
      event: eventFixture({ reminder: 15 }),
      calendar: {
        id: "cal-1",
        icsShareEnabled: true,
        forceFullEncryption: false,
      },
    });

    await service.deleteForEvent("user-1", "event-1");

    expect(prisma.calendarEvent.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: expect.objectContaining({
        reminder: null,
        encryptionState: "shadow_write",
        title: "Planning",
        description: "Discuss roadmap",
        location: "Room 7",
      }),
    });
  });
});
