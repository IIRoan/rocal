import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Elysia } from "elysia";

jest.mock("../../lib/prisma", () => ({
  prisma: {
    calendarEvent: {
      findFirst: jest.fn(async (): Promise<any> => null),
      update: jest.fn(async (): Promise<any> => null),
    },
    eventNotification: {
      deleteMany: jest.fn(async (): Promise<any> => ({ count: 0 })),
      createMany: jest.fn(async (): Promise<any> => ({ count: 0 })),
    },
    calendar: {
      findFirst: jest.fn(
        async (): Promise<any> => ({ id: "cal-1", icsShareEnabled: false }),
      ),
    },
    userSettings: {
      findUnique: jest.fn(
        async (): Promise<any> => ({ eventEncryptionMode: "hybrid" }),
      ),
    },
    $queryRaw: jest.fn(async (): Promise<any> => []),
    $executeRaw: jest.fn(async (): Promise<any> => 1),
    $transaction: jest.fn(async (callback: (tx: any) => Promise<any>) =>
      callback(
        (jest.requireMock("../../lib/prisma") as { prisma: any }).prisma,
      ),
    ),
  },
}));

jest.mock("../../lib/auth-utils", () => ({
  ensureAuthenticatedUser: jest.fn(
    async (): Promise<any> => ({
      id: "user-1",
    }),
  ),
}));

jest.mock("../../lib/auth", () => ({
  auth: { api: { getSession: jest.fn() } },
}));

jest.mock("../../lib/auth-guard", () => {
  const { Elysia: LocalElysia } =
    jest.requireActual<typeof import("elysia")>("elysia");
  return {
    requireAuth: new LocalElysia({ name: "require-auth-test" }),
  };
});

jest.mock("../../lib/notification-calculator", () => ({
  NotificationCalculator: {
    buildNotificationSchedule: jest.fn(),
  },
}));

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

import { ensureAuthenticatedUser } from "../../lib/auth-utils";
import { NotificationCalculator } from "../../lib/notification-calculator";
import { prisma } from "../../lib/prisma";
import { errorHandler } from "../../lib/errors";
import { notificationsRoutes } from "../../routes/notifications";

const mockEnsureAuthenticatedUser =
  ensureAuthenticatedUser as jest.MockedFunction<
    typeof ensureAuthenticatedUser
  >;
const mockPrisma = prisma as unknown as {
  calendarEvent: {
    findFirst: jest.Mock<() => Promise<any>>;
    update: jest.Mock<() => Promise<any>>;
  };
  eventNotification: {
    deleteMany: jest.Mock<() => Promise<any>>;
    createMany: jest.Mock<() => Promise<any>>;
  };
  calendar: {
    findFirst: jest.Mock<() => Promise<any>>;
  };
  userSettings: {
    findUnique: jest.Mock<() => Promise<any>>;
  };
  $queryRaw: jest.Mock<() => Promise<any>>;
  $executeRaw: jest.Mock<() => Promise<any>>;
  $transaction: jest.Mock<
    (callback: (tx: unknown) => Promise<unknown>) => Promise<unknown>
  >;
};
const mockBuildNotificationSchedule =
  NotificationCalculator.buildNotificationSchedule as jest.Mock;

function createApp() {
  return new Elysia({ normalize: false })
    .use(errorHandler)
    .use(notificationsRoutes);
}

function eventFixture(
  overrides: Partial<{
    id: string;
    start: Date;
    timezone: string;
    title: string;
    description: string | null;
    location: string | null;
    calendarId: string;
    reminder: number | null;
    encryptedContent: string | null;
    encryptionState: string;
    isSynced: boolean;
  }> = {},
) {
  return {
    id: "event-1",
    start: new Date("2024-02-01T12:30:00.000Z"),
    timezone: "UTC",
    title: "Planning",
    description: "Discuss roadmap",
    location: "Room 7",
    calendarId: "cal-1",
    reminder: null,
    encryptedContent: "ciphertext",
    encryptionState: "shadow_write",
    isSynced: false,
    ...overrides,
  };
}

describe("notificationsRoutes", () => {
  beforeEach(() => {
    mockEnsureAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockPrisma.calendar.findFirst.mockResolvedValue({
      id: "cal-1",
      icsShareEnabled: false,
    });
    mockPrisma.userSettings.findUnique.mockResolvedValue({
      eventEncryptionMode: "hybrid",
    });
  });

  it("returns no notifications for recurring instance ids", async () => {
    const response = await createApp().handle(
      new Request(
        "http://localhost/notifications/event/series_2024-02-01T12:30:00",
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        eventId: "series_2024-02-01T12:30:00",
        notifications: [],
        count: 0,
      },
    });
    expect(mockPrisma.calendarEvent.findFirst).not.toHaveBeenCalled();
  });

  it("returns mapped notification rows for owned events", async () => {
    mockEnsureAuthenticatedUser.mockClear();
    mockPrisma.calendarEvent.findFirst.mockResolvedValue(eventFixture());
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        id: "notification-1",
        eventId: "event-1",
        notificationType: "email",
        minutesBefore: 30,
        notificationTime: new Date("2024-02-01T12:00:00.000Z"),
        notificationDateLocal: "2024-02-01T12:00:00",
        notificationTimezone: "UTC",
        isEnabled: true,
        isSent: false,
        createdAt: new Date("2024-01-01T10:00:00.000Z"),
        updatedAt: new Date("2024-01-01T11:00:00.000Z"),
      },
    ]);

    const response = await createApp().handle(
      new Request("http://localhost/notifications/event/event-get"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        eventId: "event-get",
        notifications: [
          {
            id: "notification-1",
            eventId: "event-1",
            notificationType: "email",
            minutesBefore: 30,
            notificationTime: "2024-02-01T12:00:00.000Z",
            notificationDateLocal: "2024-02-01T12:00:00",
            notificationTimezone: "UTC",
            isEnabled: true,
            isSent: false,
            createdAt: "2024-01-01T10:00:00.000Z",
            updatedAt: "2024-01-01T11:00:00.000Z",
          },
        ],
        count: 1,
      },
    });
    expect(mockEnsureAuthenticatedUser).toHaveBeenCalledWith(
      undefined,
      expect.any(Request),
    );
  });

  it("surfaces not-found and wrapped database failures during reads", async () => {
    mockPrisma.calendarEvent.findFirst.mockResolvedValueOnce(null);

    const notFoundResponse = await createApp().handle(
      new Request("http://localhost/notifications/event/missing"),
    );

    expect(notFoundResponse.status).toBe(500);
    await expect(notFoundResponse.text()).resolves.toBe(
      "Event not found or access denied",
    );

    mockPrisma.calendarEvent.findFirst.mockResolvedValueOnce(eventFixture());
    mockPrisma.$queryRaw.mockRejectedValueOnce(new Error("db failed"));

    const errorResponse = await createApp().handle(
      new Request("http://localhost/notifications/event/broken"),
    );

    expect(errorResponse.status).toBe(500);
    await expect(errorResponse.text()).resolves.toBe(
      "Failed to retrieve event notifications",
    );
  });

  it("returns empty notifications for synced events", async () => {
    mockPrisma.calendarEvent.findFirst.mockResolvedValue(
      eventFixture({ isSynced: true }),
    );

    const response = await createApp().handle(
      new Request("http://localhost/notifications/event/event-synced"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        eventId: "event-synced",
        notifications: [],
        count: 0,
      },
    });
  });

  it("returns an auth error when notification rate limiting receives no user", async () => {
    mockEnsureAuthenticatedUser.mockResolvedValue(null as any);

    const response = await createApp().handle(
      new Request("http://localhost/notifications/event/event-no-user"),
    );

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Authentication required");
  });

  it("skips updates when the event is already in the past", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2024-02-01T12:00:00.000Z"));
    mockPrisma.calendarEvent.findFirst.mockResolvedValue(
      eventFixture({
        start: new Date("2024-02-01T11:00:00.000Z"),
      }),
    );

    const response = await createApp().handle(
      new Request("http://localhost/notifications/event/event-past", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notifications: [
            {
              notificationType: "email",
              minutesBefore: 15,
              isEnabled: true,
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Event is in the past; notifications skipped",
      data: {
        eventId: "event-past",
        created: 0,
        skipped: 1,
        details: {
          createdNotifications: [],
          skippedConfigurations: [
            {
              notificationType: "email",
              minutesBefore: 15,
              reason: "event_in_past",
            },
          ],
        },
      },
    });
  });

  it("rejects duplicate notification configurations", async () => {
    mockPrisma.calendarEvent.findFirst.mockResolvedValue(eventFixture());

    const response = await createApp().handle(
      new Request("http://localhost/notifications/event/event-duplicate", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notifications: [
            {
              notificationType: "email",
              minutesBefore: 15,
              isEnabled: true,
            },
            {
              notificationType: "email",
              minutesBefore: 15,
              isEnabled: true,
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe(
      "Duplicate notification configurations are not allowed",
    );
  });

  it("rejects unexpected notification fields", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/notifications/event/event-extra-field", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notifications: [
            {
              notificationType: "email",
              minutesBefore: 15,
              isEnabled: true,
              unexpected: true,
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.text()).resolves.toContain(
      "Property 'notifications.0.unexpected' should not be provided",
    );
    expect(mockPrisma.calendarEvent.findFirst).not.toHaveBeenCalled();
  });

  it("returns a no-op success when updating a recurring instance", async () => {
    const response = await createApp().handle(
      new Request(
        "http://localhost/notifications/event/series_2024-02-03T12:30:00",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ notifications: [] }),
        },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "No notifications to update for this event type",
    });
  });

  it("creates valid notifications and skips disabled or past schedules", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2024-02-01T12:00:00.000Z"));
    mockPrisma.calendarEvent.findFirst.mockResolvedValue(eventFixture());
    mockBuildNotificationSchedule
      .mockReturnValueOnce({
        notificationTime: new Date("2024-02-01T12:20:00.000Z"),
        notificationDateLocal: "2024-02-01T12:20:00",
        notificationTimezone: "UTC",
      })
      .mockReturnValueOnce({
        notificationTime: new Date("2024-02-01T11:50:00.000Z"),
        notificationDateLocal: "2024-02-01T11:50:00",
        notificationTimezone: "UTC",
      });

    const response = await createApp().handle(
      new Request("http://localhost/notifications/event/event-create", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notifications: [
            {
              notificationType: "email",
              minutesBefore: 10,
              isEnabled: true,
            },
            {
              notificationType: "browser",
              minutesBefore: 5,
              isEnabled: false,
            },
            {
              notificationType: "email",
              minutesBefore: 20,
              isEnabled: true,
            },
          ],
        }),
      }),
    );

    expect(mockPrisma.eventNotification.deleteMany).toHaveBeenCalledWith({
      where: { eventId: "event-create" },
    });
    expect(mockPrisma.calendarEvent.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: {
        reminder: 10,
        updatedAt: expect.any(Date),
      },
    });
    expect(mockPrisma.eventNotification.createMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.eventNotification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          eventId: "event-create",
          notificationType: "email",
          minutesBefore: 10,
        }),
      ],
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          eventId: "event-create",
          created: 1,
          skipped: 2,
          details: expect.objectContaining({
            createdNotifications: [
              expect.objectContaining({
                type: "email",
                minutesBefore: 10,
                notificationTime: "2024-02-01T12:20:00.000Z",
              }),
            ],
            skippedConfigurations: [
              {
                notificationType: "browser",
                minutesBefore: 5,
                reason: "disabled",
              },
              {
                notificationType: "email",
                minutesBefore: 20,
                reason: "notification_time_in_past",
              },
            ],
          }),
        }),
      }),
    );
  });

  it("wraps unexpected update failures", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2024-02-01T12:00:00.000Z"));
    mockPrisma.calendarEvent.findFirst.mockResolvedValue(eventFixture());
    mockBuildNotificationSchedule.mockReturnValue({
      notificationTime: new Date("2024-02-01T12:20:00.000Z"),
      notificationDateLocal: "2024-02-01T12:20:00",
      notificationTimezone: "UTC",
    });
    mockPrisma.eventNotification.createMany.mockRejectedValueOnce(
      new Error("insert failed"),
    );

    const response = await createApp().handle(
      new Request("http://localhost/notifications/event/event-update-error", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notifications: [
            {
              notificationType: "email",
              minutesBefore: 10,
              isEnabled: true,
            },
          ],
        }),
      }),
    );

    const responseBody = await response.text();
    expect(response.status).toBe(500);
    expect(responseBody).toBe("Failed to update event notifications");
  });

  it("deletes notifications for owned events and no-ops for recurring instances", async () => {
    mockPrisma.calendarEvent.findFirst.mockResolvedValue(eventFixture());
    mockPrisma.eventNotification.deleteMany.mockResolvedValue({ count: 2 });

    const deleteResponse = await createApp().handle(
      new Request("http://localhost/notifications/event/event-delete", {
        method: "DELETE",
      }),
    );

    expect(deleteResponse.status).toBe(200);
    expect(mockPrisma.calendarEvent.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: {
        reminder: null,
        updatedAt: expect.any(Date),
      },
    });
    await expect(deleteResponse.json()).resolves.toEqual({
      success: true,
      message: "Successfully deleted 2 notifications for event",
      data: {
        eventId: "event-delete",
        deletedCount: 2,
      },
    });

    const recurringResponse = await createApp().handle(
      new Request(
        "http://localhost/notifications/event/series_2024-02-02T09:00:00",
        { method: "DELETE" },
      ),
    );

    expect(recurringResponse.status).toBe(200);
    await expect(recurringResponse.json()).resolves.toEqual({
      success: true,
      message: "No notifications to delete for this event type",
      deletedCount: 0,
    });
  });

  it("updates the reminder field on fully encrypted events", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2024-02-01T12:00:00.000Z"));
    mockPrisma.calendarEvent.findFirst.mockResolvedValue(
      eventFixture({
        title: "",
        description: null,
        location: null,
        encryptionState: "encrypted",
      }),
    );
    mockBuildNotificationSchedule.mockReturnValue({
      notificationTime: new Date("2024-02-01T12:15:00.000Z"),
      notificationDateLocal: "2024-02-01T12:15:00",
      notificationTimezone: "UTC",
    });

    const response = await createApp().handle(
      new Request("http://localhost/notifications/event/event-encrypted", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notifications: [
            {
              notificationType: "email",
              minutesBefore: 15,
              isEnabled: true,
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.calendarEvent.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: {
        reminder: 15,
        updatedAt: expect.any(Date),
      },
    });
  });

  it("allows reminders on encrypted events when the calendar forces full encryption", async () => {
    mockPrisma.calendar.findFirst.mockResolvedValue({
      id: "cal-1",
      icsShareEnabled: false,
      forceFullEncryption: true,
    });
    mockPrisma.calendarEvent.findFirst.mockResolvedValue(
      eventFixture({
        title: "",
        description: null,
        location: null,
        encryptionState: "encrypted",
        encryptedContent: "ciphertext",
      }),
    );

    const response = await createApp().handle(
      new Request("http://localhost/notifications/event/event-1", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notifications: [
            {
              notificationType: "email",
              minutesBefore: 15,
              isEnabled: true,
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.calendarEvent.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: {
        reminder: 15,
        updatedAt: expect.any(Date),
      },
    });
  });

  it("wraps unexpected delete failures", async () => {
    mockPrisma.calendarEvent.findFirst.mockResolvedValue(eventFixture());
    mockPrisma.eventNotification.deleteMany.mockRejectedValueOnce(
      new Error("delete failed"),
    );

    const response = await createApp().handle(
      new Request("http://localhost/notifications/event/event-delete-error", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toBe("Failed to delete event notifications");
  });

  it("enforces the update rate limit", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2024-02-01T12:00:00.000Z"));
    mockPrisma.calendarEvent.findFirst.mockResolvedValue(eventFixture());

    for (let index = 0; index < 20; index++) {
      const response = await createApp().handle(
        new Request("http://localhost/notifications/event/event-rate-limit", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ notifications: [] }),
        }),
      );

      expect(response.status).toBe(200);
    }

    const limitedResponse = await createApp().handle(
      new Request("http://localhost/notifications/event/event-rate-limit", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notifications: [] }),
      }),
    );

    expect(limitedResponse.status).toBe(429);
    await expect(limitedResponse.text()).resolves.toContain(
      "Rate limit exceeded.",
    );
  });
});
