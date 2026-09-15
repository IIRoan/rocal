import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

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

jest.mock("@workspace/calendar-ics", () => ({
  findNationalHolidayCalendarByUrl: jest.fn(() => null),
}));

jest.mock("../../lib/ics-parser", () => ({
  parseICSFile: jest.fn(() => ({
    events: [],
    errors: [],
    calendarName: "Imported Calendar",
  })),
  convertParsedEventToCalendarEvent: jest.fn(),
  isEventModified: jest.fn(() => false),
}));

jest.mock("../../lib/safe-fetch", () => {
  const actual = jest.requireActual<typeof import("../../lib/safe-fetch")>(
    "../../lib/safe-fetch",
  );
  return { ...actual, safeFetch: jest.fn() };
});

import { SafeFetchError, safeFetch } from "../../lib/safe-fetch";
import { SubscriptionService } from "../../services/subscription.service";

const mockSafeFetch = safeFetch as jest.MockedFunction<typeof safeFetch>;

function createMockPrisma() {
  return {
    userSettings: {
      findUnique: jest.fn(async () => ({ timezone: "UTC" })),
      create: jest.fn(async () => ({ userId: "user-1", timezone: "UTC" })),
    },
    calendarSubscription: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async () => ({
        id: "sub-1",
        userId: "user-1",
        url: "https://example.com/calendar.ics",
        calendarId: "cal-1",
        etag: null,
        lastModified: null,
        calendar: { id: "cal-1" },
      })),
      update: jest.fn(async () => ({})),
      delete: jest.fn(async () => ({})),
    },
    calendar: {
      create: jest.fn(async () => ({ id: "cal-1" })),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 1 })),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    calendarEvent: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async () => ({})),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 0 })),
      delete: jest.fn(async () => ({})),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    calendarSyncLog: {
      create: jest.fn(async () => ({ id: "log-1" })),
      update: jest.fn(async () => ({})),
    },
    $transaction: jest.fn(),
  };
}

describe("SubscriptionService", () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let service: SubscriptionService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new SubscriptionService(mockPrisma as any);
    mockSafeFetch.mockReset();
  });

  it("rejects redirects to private networks when creating subscriptions", async () => {
    jest
      .spyOn(service, "syncCalendarSubscription")
      .mockResolvedValue({ status: "success" } as any);

    mockSafeFetch.mockRejectedValueOnce(
      new SafeFetchError("private-network-host"),
    );

    await expect(
      service.create({
        userId: "user-1",
        name: "Work",
        url: "https://example.com/calendar.ics",
      }),
    ).rejects.toThrow(
      "Unable to fetch or parse calendar from URL: URLs pointing to internal or private networks are not allowed",
    );

    expect(mockSafeFetch).toHaveBeenCalledWith(
      "https://example.com/calendar.ics",
      expect.objectContaining({
        maxRedirects: 5,
        timeoutMs: 10_000,
        maxBytes: 15 * 1024 * 1024,
      }),
    );
  });

  it("times out sync requests and records the error", async () => {
    mockSafeFetch.mockRejectedValueOnce(new SafeFetchError("timeout"));

    await expect(
      service.syncCalendarSubscription({
        id: "sub-1",
        userId: "user-1",
        url: "https://example.com/calendar.ics",
        calendarId: "cal-1",
        etag: null,
        lastModified: null,
        calendar: { id: "cal-1" },
      } as any),
    ).rejects.toThrow("Calendar request timed out after 10 seconds");

    expect(mockPrisma.calendarSyncLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "log-1" },
        data: expect.objectContaining({
          status: "error",
          errorMessage: "Calendar request timed out after 10 seconds",
        }),
      }),
    );
    expect(mockPrisma.calendarSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sub-1" },
        data: expect.objectContaining({
          lastSyncStatus: "error",
          lastErrorMessage: "Calendar request timed out after 10 seconds",
        }),
      }),
    );
  });

  describe("delete", () => {
    const subscription = {
      id: "sub-1",
      userId: "user-1",
      calendarId: "cal-1",
    };

    beforeEach(() => {
      mockPrisma.calendarSubscription.findFirst.mockResolvedValue(
        subscription as any,
      );
    });

    it("deletes synced events and the sync-only calendar when deleteEvents is true", async () => {
      await service.delete({
        userId: "user-1",
        subscriptionId: "sub-1",
        deleteEvents: true,
      });

      expect(mockPrisma.calendarEvent.deleteMany).toHaveBeenCalledWith({
        where: { subscriptionId: { equals: "sub-1" } },
      });
      expect(mockPrisma.calendarSubscription.delete).toHaveBeenCalledWith({
        where: { id: "sub-1" },
      });
      expect(mockPrisma.calendar.deleteMany).toHaveBeenCalledWith({
        where: { id: "cal-1", userId: "user-1", isSyncOnly: true },
      });
      expect(mockPrisma.calendarEvent.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.calendar.updateMany).not.toHaveBeenCalled();
    });

    it("keeps events and converts the calendar when deleteEvents is false", async () => {
      await service.delete({
        userId: "user-1",
        subscriptionId: "sub-1",
        deleteEvents: false,
      });

      expect(mockPrisma.calendarEvent.updateMany).toHaveBeenCalledWith({
        where: { subscriptionId: { equals: "sub-1" } },
        data: {
          subscriptionId: null,
          isSynced: false,
          externalId: null,
          syncedAt: null,
        },
      });
      expect(mockPrisma.calendar.updateMany).toHaveBeenCalledWith({
        where: { id: "cal-1", userId: "user-1", isSyncOnly: true },
        data: { isSyncOnly: false, kind: "owned" },
      });
      expect(mockPrisma.calendarSubscription.delete).toHaveBeenCalledWith({
        where: { id: "sub-1" },
      });
      expect(mockPrisma.calendarEvent.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.calendar.deleteMany).not.toHaveBeenCalled();
    });
  });
});
