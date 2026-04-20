import {
  afterAll,
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

import { SubscriptionService } from "../../services/subscription.service";

const originalFetch = global.fetch;

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
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    calendarEvent: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async () => ({})),
      update: jest.fn(async () => ({})),
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
  let mockFetch: any;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new SubscriptionService(mockPrisma as any);
    mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof global.fetch;
  });

  it("rejects redirects to private networks when creating subscriptions", async () => {
    jest
      .spyOn(service, "syncCalendarSubscription")
      .mockResolvedValue({ status: "success" } as any);

    mockFetch.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {
          location: "http://127.0.0.1/private.ics",
        },
      }),
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

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/calendar.ics",
      expect.objectContaining({
        redirect: "manual",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("times out sync requests and records the error", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    mockFetch.mockRejectedValueOnce(abortError);

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
});

afterAll(() => {
  global.fetch = originalFetch;
});
