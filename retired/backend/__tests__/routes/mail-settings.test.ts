import { describe, expect, it, jest } from "@jest/globals";
import { Elysia } from "elysia";

jest.mock("../../lib/prisma", () => ({
  prisma: {
    userMailSettings: {
      findUnique: jest.fn(async (): Promise<any> => null),
      upsert: jest.fn(async (): Promise<any> => null),
    },
  },
}));

jest.mock("../../lib/auth", () => ({
  auth: { api: { getSession: jest.fn() } },
}));

jest.mock("../../lib/auth-guard", () => {
  const { createMockRequireAuth } =
    jest.requireActual<typeof import("../helpers/mock-require-auth")>(
      "../helpers/mock-require-auth",
    );
  return {
    requireAuth: createMockRequireAuth(),
  };
});

import { errorHandler } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { mailSettingsRoutes } from "../../routes/mail-settings";

const mockPrisma = prisma as unknown as {
  userMailSettings: {
    findUnique: jest.Mock<() => Promise<any>>;
    upsert: jest.Mock<() => Promise<any>>;
  };
};

function createApp() {
  return new Elysia({ normalize: false })
    .use(errorHandler)
    .use(mailSettingsRoutes);
}

async function readJson(response: Response) {
  return response.json();
}

describe("mailSettingsRoutes", () => {
  it("returns null when no mail settings exist", async () => {
    mockPrisma.userMailSettings.findUnique.mockResolvedValue(null);

    const response = await createApp().handle(
      new Request("http://localhost/mail-settings/"),
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toBeNull();
  });

  it("returns encrypted mail settings", async () => {
    mockPrisma.userMailSettings.findUnique.mockResolvedValue({
      encryptedContent: '{"version":1}',
      encryptionKeyVersion: 1,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const response = await createApp().handle(
      new Request("http://localhost/mail-settings/"),
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      encryptedContent: '{"version":1}',
      encryptionKeyVersion: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("upserts encrypted mail settings", async () => {
    mockPrisma.userMailSettings.upsert.mockResolvedValue({
      encryptedContent: '{"version":1,"algorithm":"AES-GCM"}',
      encryptionKeyVersion: 1,
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    });

    const response = await createApp().handle(
      new Request("http://localhost/mail-settings/", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          encryptedContent: '{"version":1,"algorithm":"AES-GCM"}',
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      encryptedContent: '{"version":1,"algorithm":"AES-GCM"}',
      encryptionKeyVersion: 1,
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(mockPrisma.userMailSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        create: expect.objectContaining({
          userId: "user-1",
          encryptedContent: '{"version":1,"algorithm":"AES-GCM"}',
        }),
      }),
    );
  });
});
