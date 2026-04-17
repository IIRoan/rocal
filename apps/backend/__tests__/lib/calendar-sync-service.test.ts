import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

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

jest.mock("../../lib/prisma", () => ({
  prisma: {
    calendarSubscription: {
      findMany: jest.fn(async (): Promise<any> => []),
      findUnique: jest.fn(async (): Promise<any> => null),
      count: jest.fn(async (): Promise<number> => 0),
    },
    calendarSyncLog: {
      findMany: jest.fn(async (): Promise<any> => []),
      deleteMany: jest.fn(async (): Promise<any> => ({ count: 0 })),
    },
  },
}));

jest.mock("../../routes/subscriptions", () => ({
  syncCalendarSubscription: jest.fn(async (): Promise<void> => undefined),
}));

import { prisma } from "../../lib/prisma";
import { syncCalendarSubscription } from "../../routes/subscriptions";
import { CalendarSyncService } from "../../lib/calendar-sync-service";

const mockPrisma = prisma as unknown as {
  calendarSubscription: {
    findMany: jest.Mock<() => Promise<any>>;
    findUnique: jest.Mock<() => Promise<any>>;
    count: jest.Mock<() => Promise<number>>;
  };
  calendarSyncLog: {
    findMany: jest.Mock<() => Promise<any>>;
    deleteMany: jest.Mock<() => Promise<any>>;
  };
};

const mockSyncCalendarSubscription = syncCalendarSubscription as unknown as jest.Mock;

describe("CalendarSyncService", () => {
  let service: CalendarSyncService;

  beforeEach(() => {
    service = CalendarSyncService.getInstance();
    service.stop();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2024-02-01T12:00:00.000Z"));
  });

  afterEach(() => {
    service.stop();
    jest.restoreAllMocks();
  });

  it("returns the same singleton instance", () => {
    expect(CalendarSyncService.getInstance()).toBe(service);
  });

  it("starts only once and schedules initial plus interval syncs", async () => {
    const syncSpy = jest
      .spyOn(service, "syncAllActiveSubscriptions")
      .mockResolvedValue(undefined);

    service.start();
    service.start();

    expect(service.getStatus().isRunning).toBe(true);

    await jest.advanceTimersByTimeAsync(5000);
    expect(syncSpy).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(15 * 60 * 1000);
    expect(syncSpy).toHaveBeenCalledTimes(2);

    service.stop();
    expect(service.getStatus()).toEqual({ isRunning: false });
  });

  it("swallows and logs timer-driven sync failures", async () => {
    jest
      .spyOn(service, "syncAllActiveSubscriptions")
      .mockRejectedValue(new Error("sync failed"));

    service.start();

    await jest.advanceTimersByTimeAsync(5000);
    await jest.advanceTimersByTimeAsync(15 * 60 * 1000);

    expect(service.getStatus().isRunning).toBe(true);
  });

  it("syncs due subscriptions, skips recent ones, and cleans old logs", async () => {
    mockPrisma.calendarSubscription.findMany
      .mockResolvedValueOnce([
        {
          id: "sub-due",
          name: "Due",
          lastSyncAt: null,
          syncIntervalMinutes: 15,
        },
        {
          id: "sub-recent",
          name: "Recent",
          lastSyncAt: new Date("2024-02-01T11:59:00.000Z"),
          syncIntervalMinutes: 15,
        },
      ])
      .mockResolvedValueOnce([{ id: "sub-due" }, { id: "sub-recent" }]);
    mockPrisma.calendarSyncLog.findMany
      .mockResolvedValueOnce([{ id: "log-1" }, { id: "log-2" }])
      .mockResolvedValueOnce([]);

    await service.syncAllActiveSubscriptions();

    expect(mockPrisma.calendarSubscription.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        isActive: true,
        OR: [
          { lastSyncAt: null },
          {
            lastSyncAt: {
              lt: new Date(Date.now() - 15 * 60 * 1000),
            },
          },
        ],
      },
      include: {
        calendar: true,
        user: true,
      },
      orderBy: {
        lastSyncAt: "asc",
      },
    });
    expect(mockSyncCalendarSubscription).toHaveBeenCalledTimes(1);
    expect(mockSyncCalendarSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sub-due" }),
    );
    expect(mockPrisma.calendarSyncLog.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["log-1", "log-2"] },
      },
    });
  });

  it("swallows top-level sync query failures", async () => {
    mockPrisma.calendarSubscription.findMany.mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    await expect(service.syncAllActiveSubscriptions()).resolves.toBeUndefined();
  });

  it("continues across batched sync errors and waits between batches", async () => {
    mockPrisma.calendarSubscription.findMany
      .mockResolvedValueOnce([
        { id: "sub-1", name: "One", lastSyncAt: null, syncIntervalMinutes: 15 },
        { id: "sub-2", name: "Two", lastSyncAt: null, syncIntervalMinutes: 15 },
        { id: "sub-3", name: "Three", lastSyncAt: null, syncIntervalMinutes: 15 },
        { id: "sub-4", name: "Four", lastSyncAt: null, syncIntervalMinutes: 15 },
        { id: "sub-5", name: "Five", lastSyncAt: null, syncIntervalMinutes: 15 },
        { id: "sub-6", name: "Six", lastSyncAt: null, syncIntervalMinutes: 15 },
      ])
      .mockResolvedValueOnce([]);
    mockSyncCalendarSubscription.mockImplementation(async (subscription: any) => {
      if (subscription.id === "sub-3") {
        throw new Error("subscription sync failed");
      }
    });

    const syncPromise = service.syncAllActiveSubscriptions();
    await jest.advanceTimersByTimeAsync(1000);
    await syncPromise;

    expect(mockSyncCalendarSubscription).toHaveBeenCalledTimes(6);
  });

  it("syncs a specific active subscription", async () => {
    mockPrisma.calendarSubscription.findUnique.mockResolvedValue({
      id: "sub-1",
      isActive: true,
      calendar: {},
      user: {},
    });

    await service.syncSubscription("sub-1");

    expect(mockPrisma.calendarSubscription.findUnique).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      include: { calendar: true, user: true },
    });
    expect(mockSyncCalendarSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sub-1" }),
    );
  });

  it("rejects missing and inactive subscriptions", async () => {
    mockPrisma.calendarSubscription.findUnique.mockResolvedValueOnce(null);

    await expect(service.syncSubscription("missing")).rejects.toThrow(
      "Subscription not found",
    );

    mockPrisma.calendarSubscription.findUnique.mockResolvedValueOnce({
      id: "inactive",
      isActive: false,
      calendar: {},
      user: {},
    });

    await expect(service.syncSubscription("inactive")).rejects.toThrow(
      "Subscription is not active",
    );
  });

  it("reports scheduler status when running", () => {
    service.start();

    const status = service.getStatus();

    expect(status.isRunning).toBe(true);
    expect(status.nextSyncIn).toBeGreaterThanOrEqual(0);
    expect(status.nextSyncIn).toBeLessThanOrEqual(15 * 60 * 1000);
  });

  it("returns subscription statistics", async () => {
    mockPrisma.calendarSubscription.count
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3);

    await expect(service.getSubscriptionStats()).resolves.toEqual({
      total: 8,
      active: 5,
      inactive: 3,
      withErrors: 2,
      neverSynced: 3,
    });
  });

  it("swallows cleanup log failures", async () => {
    mockPrisma.calendarSubscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "sub-1" }]);
    mockPrisma.calendarSyncLog.findMany.mockRejectedValueOnce(
      new Error("cleanup failed"),
    );

    await expect(service.syncAllActiveSubscriptions()).resolves.toBeUndefined();
  });
});
