import { describe, expect, it, jest } from "@jest/globals";

jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  }),
}));

import { CalendarSharingService } from "../../services/calendar-sharing.service";

describe("CalendarSharingService.disableShareLink", () => {
  it("re-encrypts share-only hybrid events after disabling sharing", async () => {
    const findFirst = jest.fn<
      () => Promise<{
        id: string;
        forceFullEncryption: boolean;
        isSyncOnly: boolean;
      } | null>
    >();
    const update = jest.fn<() => Promise<{ id: string }>>();
    const updateMany = jest.fn<() => Promise<{ count: number }>>();
    const findUnique = jest.fn<
      () => Promise<{ eventEncryptionMode: "hybrid" | "full" } | null>
    >();

    findFirst.mockResolvedValueOnce({
      id: "cal-1",
      forceFullEncryption: false,
      isSyncOnly: false,
    });
    update.mockResolvedValue({ id: "cal-1" });
    updateMany.mockResolvedValue({ count: 2 });
    findUnique.mockResolvedValue({ eventEncryptionMode: "hybrid" });

    const prisma = {
      calendar: {
        findFirst,
        update,
      },
      calendarEvent: {
        updateMany,
      },
      userSettings: {
        findUnique,
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
    expect(prisma.calendarEvent.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        calendarId: "cal-1",
        encryptedContent: { not: null },
        encryptionState: { not: "encrypted" },
        OR: [{ reminder: null }, { reminder: 0 }],
      },
      data: {
        title: "",
        description: null,
        location: null,
        encryptionState: "encrypted",
        updatedAt: expect.any(Date),
      },
    });
  });

  it("re-encrypts all encrypted payload rows when full encryption is active", async () => {
    const findFirst = jest.fn<
      () => Promise<{
        id: string;
        forceFullEncryption: boolean;
        isSyncOnly: boolean;
      } | null>
    >();
    const update = jest.fn<() => Promise<{ id: string }>>();
    const updateMany = jest.fn<() => Promise<{ count: number }>>();
    const findUnique = jest.fn<
      () => Promise<{ eventEncryptionMode: "hybrid" | "full" } | null>
    >();

    findFirst.mockResolvedValueOnce({
      id: "cal-1",
      forceFullEncryption: false,
      isSyncOnly: false,
    });
    update.mockResolvedValue({ id: "cal-1" });
    updateMany.mockResolvedValue({ count: 3 });
    findUnique.mockResolvedValue({ eventEncryptionMode: "full" });

    const prisma = {
      calendar: {
        findFirst,
        update,
      },
      calendarEvent: {
        updateMany,
      },
      userSettings: {
        findUnique,
      },
    };

    const service = new CalendarSharingService(prisma as never);

    await service.disableShareLink({
      userId: "user-1",
      calendarId: "cal-1",
      baseUrl: "https://example.com",
    });

    expect(prisma.calendarEvent.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        calendarId: "cal-1",
        encryptedContent: { not: null },
        encryptionState: { not: "encrypted" },
      },
      data: {
        title: "",
        description: null,
        location: null,
        encryptionState: "encrypted",
        updatedAt: expect.any(Date),
      },
    });
  });

  it("treats missing user settings as hybrid and preserves reminder-backed shadows", async () => {
    const findFirst = jest.fn<
      () => Promise<{
        id: string;
        forceFullEncryption: boolean;
        isSyncOnly: boolean;
      } | null>
    >();
    const update = jest.fn<() => Promise<{ id: string }>>();
    const updateMany = jest.fn<() => Promise<{ count: number }>>();
    const findUnique = jest.fn<
      () => Promise<{ eventEncryptionMode: "hybrid" | "full" } | null>
    >();

    findFirst.mockResolvedValueOnce({
      id: "cal-1",
      forceFullEncryption: false,
      isSyncOnly: false,
    });
    update.mockResolvedValue({ id: "cal-1" });
    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockResolvedValue(null);

    const prisma = {
      calendar: {
        findFirst,
        update,
      },
      calendarEvent: {
        updateMany,
      },
      userSettings: {
        findUnique,
      },
    };

    const service = new CalendarSharingService(prisma as never);

    await service.disableShareLink({
      userId: "user-1",
      calendarId: "cal-1",
      baseUrl: "https://example.com",
    });

    expect(prisma.calendarEvent.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        calendarId: "cal-1",
        encryptedContent: { not: null },
        encryptionState: { not: "encrypted" },
        OR: [{ reminder: null }, { reminder: 0 }],
      },
      data: {
        title: "",
        description: null,
        location: null,
        encryptionState: "encrypted",
        updatedAt: expect.any(Date),
      },
    });
  });

  it("re-encrypts all encrypted payload rows when the calendar forces full encryption", async () => {
    const findFirst = jest.fn<
      () => Promise<{
        id: string;
        forceFullEncryption: boolean;
        isSyncOnly: boolean;
      } | null>
    >();
    const update = jest.fn<() => Promise<{ id: string }>>();
    const updateMany = jest.fn<() => Promise<{ count: number }>>();
    const findUnique = jest.fn<
      () => Promise<{ eventEncryptionMode: "hybrid" | "full" } | null>
    >();

    findFirst.mockResolvedValueOnce({
      id: "cal-1",
      forceFullEncryption: true,
      isSyncOnly: false,
    });
    update.mockResolvedValue({ id: "cal-1" });
    updateMany.mockResolvedValue({ count: 4 });
    findUnique.mockResolvedValue({ eventEncryptionMode: "hybrid" });

    const prisma = {
      calendar: {
        findFirst,
        update,
      },
      calendarEvent: {
        updateMany,
      },
      userSettings: {
        findUnique,
      },
    };

    const service = new CalendarSharingService(prisma as never);

    await service.disableShareLink({
      userId: "user-1",
      calendarId: "cal-1",
      baseUrl: "https://example.com",
    });

    expect(prisma.calendarEvent.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        calendarId: "cal-1",
        encryptedContent: { not: null },
        encryptionState: { not: "encrypted" },
      },
      data: {
        title: "",
        description: null,
        location: null,
        encryptionState: "encrypted",
        updatedAt: expect.any(Date),
      },
    });
  });
});