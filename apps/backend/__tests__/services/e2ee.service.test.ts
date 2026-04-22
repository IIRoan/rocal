import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { E2eeService } from "../../services/e2ee.service";

function createMockPrisma() {
  return {
    userEncryptionDevice: {
      findMany: jest.fn<() => Promise<any[]>>(async () => []),
      upsert: jest.fn(async () => ({
        id: "device-record-1",
        userId: "user-1",
        deviceId: "device-1",
        deviceLabel: "Main Browser",
        publicKey: "public-key",
        publicKeyAlgorithm: "RSA-OAEP-256",
        wrappedAccountKey: "wrapped-account",
        wrappedSearchKey: "wrapped-search",
        wrapAlgorithm: "RSA-OAEP-256",
        keyVersion: 1,
        lastSeenAt: new Date("2026-04-21T12:00:00.000Z"),
        createdAt: new Date("2026-04-21T11:00:00.000Z"),
        updatedAt: new Date("2026-04-21T12:00:00.000Z"),
      })),
    },
    userEncryptionPassword: {
      findUnique: jest.fn<() => Promise<any | null>>(async () => null),
      upsert: jest.fn(async () => ({
        id: "password-record-1",
        userId: "user-1",
        kdfAlgorithm: "PBKDF2-SHA-256",
        kdfSalt: "salt-1",
        kdfIterations: 310000,
        wrappedAccountKey: "wrapped-account",
        wrappedSearchKey: "wrapped-search",
        wrapAlgorithm: "AES-GCM-256",
        keyVersion: 1,
        createdAt: new Date("2026-04-21T11:00:00.000Z"),
        updatedAt: new Date("2026-04-21T12:00:00.000Z"),
      })),
    },
    calendar: {
      findMany: jest.fn<() => Promise<any[]>>(async () => []),
    },
    eventCategory: {
      findMany: jest.fn<() => Promise<any[]>>(async () => []),
    },
    calendarEvent: {
      findMany: jest.fn<() => Promise<any[]>>(async () => []),
    },
  };
}

describe("E2eeService", () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let service: E2eeService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new E2eeService(mockPrisma as any);
  });

  it("parses blind-index tokens from bootstrap rows and falls back to empty arrays", async () => {
    mockPrisma.calendar.findMany.mockResolvedValue([
      {
        id: "calendar-1",
        name: "Work",
        encryptedName: "ciphertext",
        blindIndexTokens: JSON.stringify(["idx-1", 2, "idx-2"]),
        encryptionState: "shadow_write",
        encryptionKeyVersion: 2,
        color: "blue",
        kind: "owned",
        isDefault: true,
        isVisible: true,
        createdAt: new Date("2026-04-20T11:00:00.000Z"),
        updatedAt: new Date("2026-04-21T12:00:00.000Z"),
      },
      {
        id: "calendar-2",
        name: "Personal",
        encryptedName: null,
        blindIndexTokens: "not-json",
        encryptionState: "plaintext",
        encryptionKeyVersion: 1,
        color: "emerald",
        kind: "owned",
        isDefault: false,
        isVisible: true,
        createdAt: new Date("2026-04-20T11:00:00.000Z"),
        updatedAt: new Date("2026-04-21T12:00:00.000Z"),
      },
    ]);

    const result = await service.getBootstrap("user-1");

    expect(mockPrisma.userEncryptionDevice.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: [{ lastSeenAt: "desc" }, { createdAt: "asc" }],
    });
    expect(mockPrisma.userEncryptionPassword.findUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
    expect(result.calendars[0]?.blindIndexTokens).toEqual(["idx-1", "idx-2"]);
    expect(result.calendars[1]?.blindIndexTokens).toEqual([]);
  });

  it("includes the password envelope in bootstrap responses", async () => {
    mockPrisma.userEncryptionPassword.findUnique.mockResolvedValue({
      id: "password-record-1",
      userId: "user-1",
      kdfAlgorithm: "PBKDF2-SHA-256",
      kdfSalt: "salt-1",
      kdfIterations: 310000,
      wrappedAccountKey: "wrapped-account",
      wrappedSearchKey: "wrapped-search",
      wrapAlgorithm: "AES-GCM-256",
      keyVersion: 2,
      createdAt: new Date("2026-04-21T11:00:00.000Z"),
      updatedAt: new Date("2026-04-21T12:00:00.000Z"),
    });

    const result = await service.getBootstrap("user-1");

    expect(result.passwordEnvelope).toEqual(
      expect.objectContaining({
        id: "password-record-1",
        userId: "user-1",
        kdfSalt: "salt-1",
        kdfIterations: 310000,
        keyVersion: 2,
      }),
    );
    expect(result.algorithms.passwordWrapping).toBe("AES-GCM-256");
  });

  it("returns reset snapshot records for writable encrypted items", async () => {
    mockPrisma.calendar.findMany.mockResolvedValue([
      {
        id: "calendar-1",
        name: "Work",
        encryptedName: "ciphertext",
        blindIndexTokens: JSON.stringify(["idx-1"]),
        encryptionState: "shadow_write",
        encryptionKeyVersion: 2,
        color: "blue",
        kind: "owned",
        isDefault: true,
        isVisible: true,
        createdAt: new Date("2026-04-20T11:00:00.000Z"),
        updatedAt: new Date("2026-04-21T12:00:00.000Z"),
      },
    ]);
    mockPrisma.eventCategory.findMany.mockResolvedValue([
      {
        id: "category-1",
        name: "Focus",
        encryptedName: "ciphertext",
        blindIndexTokens: JSON.stringify(["idx-2"]),
        encryptionState: "shadow_write",
        encryptionKeyVersion: 2,
        color: "violet",
        isActive: true,
        createdAt: new Date("2026-04-20T11:00:00.000Z"),
        updatedAt: new Date("2026-04-21T12:00:00.000Z"),
      },
    ]);
    mockPrisma.calendarEvent.findMany.mockResolvedValue([
      {
        id: "event-1",
        title: "Planning",
        description: "Discuss roadmap",
        encryptedContent: "ciphertext",
        blindIndexTokens: JSON.stringify(["idx-3"]),
        encryptionState: "shadow_write",
        encryptionKeyVersion: 2,
        start: new Date("2026-05-01T10:00:00.000Z"),
        end: new Date("2026-05-01T11:00:00.000Z"),
        timezone: "UTC",
        allDay: false,
        location: "Room 7",
        color: "blue",
        calendarId: "calendar-1",
        categoryId: "category-1",
        reminder: 15,
        recurrence: null,
        parentEventId: null,
        createdAt: new Date("2026-04-20T11:00:00.000Z"),
        updatedAt: new Date("2026-04-21T12:00:00.000Z"),
      },
    ]);

    const result = await service.getResetSnapshot("user-1");

    expect(mockPrisma.calendar.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", kind: "owned" },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
    expect(mockPrisma.eventCategory.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", isActive: true },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    });
    expect(mockPrisma.calendarEvent.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", isSynced: false },
      orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
    });
    expect(result).toEqual({
      calendars: [
        expect.objectContaining({
          id: "calendar-1",
          blindIndexTokens: ["idx-1"],
        }),
      ],
      categories: [
        expect.objectContaining({
          id: "category-1",
          blindIndexTokens: ["idx-2"],
        }),
      ],
      events: [
        expect.objectContaining({
          id: "event-1",
          blindIndexTokens: ["idx-3"],
          encryptedContent: "ciphertext",
        }),
      ],
    });
  });

  it("trims and defaults device registration fields on upsert", async () => {
    await service.upsertDevice({
      userId: "user-1",
      deviceId: "  device-1  ",
      deviceLabel: "  Main Browser  ",
      publicKey: "  public-key  ",
      wrappedAccountKey: "  wrapped-account  ",
      wrappedSearchKey: "  wrapped-search  ",
    });

    expect(mockPrisma.userEncryptionDevice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_deviceId: {
            userId: "user-1",
            deviceId: "device-1",
          },
        },
        create: expect.objectContaining({
          userId: "user-1",
          deviceId: "device-1",
          deviceLabel: "Main Browser",
          publicKey: "public-key",
          publicKeyAlgorithm: "RSA-OAEP-256",
          wrappedAccountKey: "wrapped-account",
          wrappedSearchKey: "wrapped-search",
          wrapAlgorithm: "RSA-OAEP-256",
          keyVersion: 1,
          lastSeenAt: expect.any(Date),
        }),
        update: expect.objectContaining({
          deviceLabel: "Main Browser",
          publicKey: "public-key",
          wrappedAccountKey: "wrapped-account",
          wrappedSearchKey: "wrapped-search",
          keyVersion: 1,
          lastSeenAt: expect.any(Date),
        }),
      }),
    );
  });

  it("rejects invalid key versions before writing to prisma", async () => {
    await expect(
      service.upsertDevice({
        userId: "user-1",
        deviceId: "device-1",
        publicKey: "public-key",
        wrappedAccountKey: "wrapped-account",
        wrappedSearchKey: "wrapped-search",
        keyVersion: 0,
      }),
    ).rejects.toThrow("Key version must be at least 1");

    expect(mockPrisma.userEncryptionDevice.upsert).not.toHaveBeenCalled();
  });

  it("trims and defaults password envelope fields on upsert", async () => {
    await service.upsertPasswordEnvelope({
      userId: "user-1",
      kdfSalt: "  salt-1  ",
      wrappedAccountKey: "  wrapped-account  ",
      wrappedSearchKey: "  wrapped-search  ",
    });

    expect(mockPrisma.userEncryptionPassword.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: {
        userId: "user-1",
        kdfAlgorithm: "PBKDF2-SHA-256",
        kdfSalt: "salt-1",
        kdfIterations: 310000,
        wrappedAccountKey: "wrapped-account",
        wrappedSearchKey: "wrapped-search",
        wrapAlgorithm: "AES-GCM-256",
        keyVersion: 1,
      },
      update: {
        kdfAlgorithm: "PBKDF2-SHA-256",
        kdfSalt: "salt-1",
        kdfIterations: 310000,
        wrappedAccountKey: "wrapped-account",
        wrappedSearchKey: "wrapped-search",
        wrapAlgorithm: "AES-GCM-256",
        keyVersion: 1,
      },
    });
  });

  it("rejects weak password KDF settings before writing to prisma", async () => {
    await expect(
      service.upsertPasswordEnvelope({
        userId: "user-1",
        kdfSalt: "salt-1",
        kdfIterations: 50000,
        wrappedAccountKey: "wrapped-account",
        wrappedSearchKey: "wrapped-search",
      }),
    ).rejects.toThrow("KDF iterations must be at least 100000");

    expect(mockPrisma.userEncryptionPassword.upsert).not.toHaveBeenCalled();
  });
});