import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Elysia } from "elysia";

jest.mock("../../lib/prisma", () => ({
  prisma: {
    userEncryptionDevice: {
      findMany: jest.fn(async (): Promise<any> => []),
      upsert: jest.fn(async (): Promise<any> => null),
    },
    calendar: {
      findMany: jest.fn(async (): Promise<any> => []),
    },
  },
}));

jest.mock("../../lib/auth-utils", () => ({
  ensureAuthenticatedUser: jest.fn(async (): Promise<any> => ({
    id: "user-1",
  })),
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

import { errorHandler } from "../../lib/errors";
import { ensureAuthenticatedUser } from "../../lib/auth-utils";
import { prisma } from "../../lib/prisma";
import { e2eeRoutes } from "../../routes/e2ee";

const mockEnsureAuthenticatedUser =
  ensureAuthenticatedUser as jest.MockedFunction<typeof ensureAuthenticatedUser>;
const mockPrisma = prisma as unknown as {
  userEncryptionDevice: {
    findMany: jest.Mock<() => Promise<any>>;
    upsert: jest.Mock<() => Promise<any>>;
  };
  calendar: {
    findMany: jest.Mock<() => Promise<any>>;
  };
};

function createApp() {
  return new Elysia({ normalize: false }).use(errorHandler).use(e2eeRoutes);
}

async function readJson(response: Response) {
  return response.json();
}

async function readText(response: Response) {
  return response.text();
}

describe("e2eeRoutes", () => {
  beforeEach(() => {
    mockEnsureAuthenticatedUser.mockResolvedValue({ id: "user-1" });
  });

  it("returns bootstrap metadata for the authenticated user", async () => {
    mockPrisma.userEncryptionDevice.findMany.mockResolvedValue([
      {
        id: "device-record-1",
        userId: "user-1",
        deviceId: "device-1",
        deviceLabel: "Roan Laptop",
        publicKey: "public-key",
        publicKeyAlgorithm: "RSA-OAEP-256",
        wrappedAccountKey: "wrapped-account",
        wrappedSearchKey: "wrapped-search",
        wrapAlgorithm: "RSA-OAEP-256",
        keyVersion: 1,
        lastSeenAt: new Date("2026-04-21T12:00:00.000Z"),
        createdAt: new Date("2026-04-21T11:00:00.000Z"),
        updatedAt: new Date("2026-04-21T12:00:00.000Z"),
      },
    ]);
    mockPrisma.calendar.findMany.mockResolvedValue([
      {
        id: "calendar-1",
        name: "Work",
        encryptedName: "ciphertext",
        blindIndexTokens: JSON.stringify(["abc", "def"]),
        encryptionState: "shadow_write",
        encryptionKeyVersion: 1,
        color: "blue",
        kind: "owned",
        isDefault: true,
        isVisible: true,
        createdAt: new Date("2026-04-20T11:00:00.000Z"),
        updatedAt: new Date("2026-04-21T12:00:00.000Z"),
      },
    ]);

    const response = await createApp().handle(
      new Request("http://localhost/e2ee/bootstrap"),
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      enabled: true,
      rolloutStage: "shadow_write",
      algorithms: {
        content: "AES-GCM-256",
        blindIndex: "HMAC-SHA-256",
        wrapping: "RSA-OAEP-256",
      },
      devices: [
        {
          id: "device-record-1",
          userId: "user-1",
          deviceId: "device-1",
          deviceLabel: "Roan Laptop",
          publicKey: "public-key",
          publicKeyAlgorithm: "RSA-OAEP-256",
          wrappedAccountKey: "wrapped-account",
          wrappedSearchKey: "wrapped-search",
          wrapAlgorithm: "RSA-OAEP-256",
          keyVersion: 1,
          lastSeenAt: "2026-04-21T12:00:00.000Z",
          createdAt: "2026-04-21T11:00:00.000Z",
          updatedAt: "2026-04-21T12:00:00.000Z",
        },
      ],
      calendars: [
        {
          id: "calendar-1",
          name: "Work",
          encryptedName: "ciphertext",
          blindIndexTokens: ["abc", "def"],
          encryptionState: "shadow_write",
          encryptionKeyVersion: 1,
          color: "blue",
          kind: "owned",
          isDefault: true,
          isVisible: true,
          createdAt: "2026-04-20T11:00:00.000Z",
          updatedAt: "2026-04-21T12:00:00.000Z",
        },
      ],
    });
  });

  it("upserts a device registration with trimmed values", async () => {
    mockPrisma.userEncryptionDevice.upsert.mockResolvedValue({
      id: "device-record-1",
      userId: "user-1",
      deviceId: "device-1",
      deviceLabel: "Work Laptop",
      publicKey: "public-key",
      publicKeyAlgorithm: "RSA-OAEP-256",
      wrappedAccountKey: "wrapped-account",
      wrappedSearchKey: "wrapped-search",
      wrapAlgorithm: "RSA-OAEP-256",
      keyVersion: 2,
      lastSeenAt: new Date("2026-04-21T12:00:00.000Z"),
      createdAt: new Date("2026-04-21T11:00:00.000Z"),
      updatedAt: new Date("2026-04-21T12:00:00.000Z"),
    });

    const response = await createApp().handle(
      new Request("http://localhost/e2ee/device", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId: "  device-1  ",
          deviceLabel: "  Work Laptop  ",
          publicKey: "  public-key  ",
          wrappedAccountKey: "  wrapped-account  ",
          wrappedSearchKey: "  wrapped-search  ",
          keyVersion: 2,
        }),
      }),
    );

    expect(response.status).toBe(200);
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
          deviceLabel: "Work Laptop",
          publicKey: "public-key",
          wrappedAccountKey: "wrapped-account",
          wrappedSearchKey: "wrapped-search",
          keyVersion: 2,
        }),
      }),
    );
  });

  it("rejects unexpected device fields", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/e2ee/device", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId: "device-1",
          publicKey: "public-key",
          wrappedAccountKey: "wrapped-account",
          wrappedSearchKey: "wrapped-search",
          unexpected: true,
        }),
      }),
    );

    expect(response.status).toBe(422);
    await expect(readText(response)).resolves.toContain(
      "Property 'unexpected' should not be provided",
    );
    expect(mockPrisma.userEncryptionDevice.upsert).not.toHaveBeenCalled();
  });
});