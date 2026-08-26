import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../lib/notification-calculator", () => ({
  NotificationCalculator: {
    buildNotificationSchedule: jest.fn(),
    scheduleUpcomingReminder: jest.fn(),
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
    title: "",
    description: null,
    location: null,
    calendarId: "cal-1",
    reminder: 15,
    encryptedContent: "ciphertext",
    encryptionState: "encrypted" as const,
    isSynced: false,
    ...overrides,
  };
}

function createHarness(
  options: Partial<{
    event: ReturnType<typeof eventFixture>;
  }> = {},
) {
  const prisma = {
    calendarEvent: {
      findFirst: jest.fn<() => Promise<any>>(),
      update: jest.fn<() => Promise<any>>(),
    },
    eventNotification: {
      findFirst: jest.fn<() => Promise<any>>(),
      deleteMany: jest.fn<() => Promise<{ count: number }>>(),
      createMany: jest.fn<() => Promise<{ count: number }>>(),
    },
    $executeRaw: jest.fn(async (): Promise<number> => 1),
    $transaction: jest.fn(async (callback: (tx: typeof prisma) => Promise<unknown>) =>
      callback(prisma),
    ),
  };

  prisma.calendarEvent.findFirst.mockResolvedValue(
    options.event ?? eventFixture(),
  );
  prisma.calendarEvent.update.mockResolvedValue({ id: "event-1" });
  prisma.eventNotification.findFirst.mockResolvedValue(null);
  prisma.eventNotification.deleteMany.mockResolvedValue({ count: 1 });
  prisma.eventNotification.createMany.mockResolvedValue({ count: 1 });

  return {
    prisma,
    service: new NotificationService(prisma as never),
  };
}

const mockBuildNotificationSchedule =
  NotificationCalculator.buildNotificationSchedule as jest.Mock;
const mockScheduleUpcomingReminder =
  NotificationCalculator.scheduleUpcomingReminder as jest.Mock;

describe("NotificationService reminder field updates", () => {
  beforeEach(() => {
    mockBuildNotificationSchedule.mockReset();
    mockBuildNotificationSchedule.mockReturnValue({
      notificationTime: new Date("2026-12-01T12:20:00.000Z"),
      notificationDateLocal: "2026-12-01T12:20:00",
      notificationTimezone: "UTC",
    });
    mockScheduleUpcomingReminder.mockReset();
    mockScheduleUpcomingReminder.mockReturnValue({
      notificationTime: new Date("2026-12-01T12:20:00.000Z"),
      notificationDateLocal: "2026-12-01T12:20:00",
      notificationTimezone: "UTC",
    });
  });

  it("stores the earliest enabled email reminder on the event row", async () => {
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
      }),
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("uses the earliest remaining reminder when multiple email reminders are enabled", async () => {
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
      }),
    });
    expect(prisma.eventNotification.deleteMany).toHaveBeenCalledWith({
      where: { eventId: "event-1" },
    });
    expect(prisma.eventNotification.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ minutesBefore: 30 }),
        expect.objectContaining({ minutesBefore: 60 }),
      ]),
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("clears the reminder field when only non-email notifications remain", async () => {
    const { prisma, service } = createHarness({
      event: eventFixture({ reminder: 15 }),
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
      }),
    });
  });

  it("allows email reminders on ciphertext-only encrypted events", async () => {
    const { prisma, service } = createHarness({
      event: eventFixture({
        reminder: null,
        encryptionState: "encrypted",
      }),
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
      }),
    });
  });

  it("clears the reminder field when all notifications are deleted", async () => {
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
      }),
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("stores the decrypted reminder title when the client provides one", async () => {
    const { prisma, service } = createHarness({
      event: eventFixture({ title: "" }),
    });

    await service.setForEvent(
      "user-1",
      "event-1",
      [
        {
          notificationType: "email",
          minutesBefore: 15,
          isEnabled: true,
        },
      ],
      "Lunch with Sam",
    );

    expect(prisma.eventNotification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          eventId: "event-1",
          displayTitle: "Lunch with Sam",
        }),
      ],
    });
  });

  it("preserves an existing reminder title when the client omits one", async () => {
    const { prisma, service } = createHarness({
      event: eventFixture({ title: "" }),
    });
    prisma.eventNotification.findFirst.mockResolvedValueOnce({
      displayTitle: "Lunch with Sam",
    });

    await service.setForEvent("user-1", "event-1", [
      {
        notificationType: "email",
        minutesBefore: 15,
        isEnabled: true,
      },
    ]);

    expect(prisma.eventNotification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          eventId: "event-1",
          displayTitle: "Lunch with Sam",
        }),
      ],
    });
  });

  it("wraps setForEvent writes in a prisma transaction", async () => {
    const { prisma, service } = createHarness();

    await service.setForEvent("user-1", "event-1", [
      {
        notificationType: "email",
        minutesBefore: 15,
        isEnabled: true,
      },
    ]);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
  });

  it("wraps deleteForEvent writes in a prisma transaction", async () => {
    const { prisma, service } = createHarness();

    await service.deleteForEvent("user-1", "event-1");

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
  });
});
