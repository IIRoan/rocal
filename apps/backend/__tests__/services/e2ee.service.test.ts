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
    calendar: {
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
    expect(result.calendars[0]?.blindIndexTokens).toEqual(["idx-1", "idx-2"]);
    expect(result.calendars[1]?.blindIndexTokens).toEqual([]);
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
});