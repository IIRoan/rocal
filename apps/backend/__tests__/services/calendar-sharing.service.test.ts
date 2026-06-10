import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  }),
}));

jest.mock("../../lib/event-encryption", () => ({
  backfillEncryptedEventsToCiphertextOnly: jest.fn(async () => 2),
}));

import { backfillEncryptedEventsToCiphertextOnly } from "../../lib/event-encryption";
import { CalendarSharingService } from "../../services/calendar-sharing.service";

const mockBackfillEncryptedEventsToCiphertextOnly =
  backfillEncryptedEventsToCiphertextOnly as jest.MockedFunction<
    typeof backfillEncryptedEventsToCiphertextOnly
  >;

describe("CalendarSharingService.disableShareLink", () => {
  beforeEach(() => {
    mockBackfillEncryptedEventsToCiphertextOnly.mockClear();
  });

  it("disables sharing and re-encrypts shadow-write events", async () => {
    const findFirst = jest.fn<
      () => Promise<{
        id: string;
        isSyncOnly: boolean;
      } | null>
    >();
    const update = jest.fn<() => Promise<{ id: string }>>();

    findFirst.mockResolvedValueOnce({
      id: "cal-1",
      isSyncOnly: false,
    });
    update.mockResolvedValue({ id: "cal-1" });

    const prisma = {
      calendar: {
        findFirst,
        update,
      },
    };

    const service = new CalendarSharingService(prisma as never);

    await expect(
      service.disableShareLink({
        userId: "user-1",
        calendarId: "cal-1",
        baseUrl: "https://example.com",
      }),
    ).resolves.toEqual({ success: true });

    expect(prisma.calendar.update).toHaveBeenCalledWith({
      where: { id: "cal-1" },
      data: {
        icsShareEnabled: false,
        icsShareToken: null,
        updatedAt: expect.any(Date),
      },
    });
    expect(mockBackfillEncryptedEventsToCiphertextOnly).toHaveBeenCalledWith(
      prisma,
      {
        userId: "user-1",
        calendarId: "cal-1",
        now: expect.any(Date),
      },
    );
  });

  it("rejects disabling sharing for synced calendars", async () => {
    const findFirst = jest.fn<
      () => Promise<{
        id: string;
        isSyncOnly: boolean;
      } | null>
    >();

    findFirst.mockResolvedValueOnce({
      id: "cal-1",
      isSyncOnly: true,
    });

    const prisma = {
      calendar: {
        findFirst,
        update: jest.fn(),
      },
    };

    const service = new CalendarSharingService(prisma as never);

    await expect(
      service.disableShareLink({
        userId: "user-1",
        calendarId: "cal-1",
        baseUrl: "https://example.com",
      }),
    ).rejects.toThrow("Cannot modify sharing for a synced calendar.");

    expect(mockBackfillEncryptedEventsToCiphertextOnly).not.toHaveBeenCalled();
  });
});
