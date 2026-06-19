import { describe, expect, it, jest } from "@jest/globals";
import { Elysia } from "elysia";

jest.mock("../../lib/prisma", () => ({
  prisma: {
    userRecentContacts: {
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
import { recentContactsRoutes } from "../../routes/recent-contacts";

const mockPrisma = prisma as unknown as {
  userRecentContacts: {
    findUnique: jest.Mock<() => Promise<any>>;
    upsert: jest.Mock<() => Promise<any>>;
  };
};

function createApp() {
  return new Elysia({ normalize: false })
    .use(errorHandler)
    .use(recentContactsRoutes);
}

async function readJson(response: Response) {
  return response.json();
}

describe("recentContactsRoutes", () => {
  it("returns null when no recent contacts exist", async () => {
    mockPrisma.userRecentContacts.findUnique.mockResolvedValue(null);

    const response = await createApp().handle(
      new Request("http://localhost/recent-contacts/"),
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toBeNull();
  });

  it("returns encrypted recent contacts", async () => {
    mockPrisma.userRecentContacts.findUnique.mockResolvedValue({
      encryptedContent: '{"version":1}',
      encryptionKeyVersion: 1,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const response = await createApp().handle(
      new Request("http://localhost/recent-contacts/"),
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      encryptedContent: '{"version":1}',
      encryptionKeyVersion: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("upserts encrypted recent contacts", async () => {
    mockPrisma.userRecentContacts.upsert.mockResolvedValue({
      encryptedContent: '{"version":1,"algorithm":"AES-GCM"}',
      encryptionKeyVersion: 1,
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    });

    const response = await createApp().handle(
      new Request("http://localhost/recent-contacts/", {
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
    expect(mockPrisma.userRecentContacts.upsert).toHaveBeenCalledWith(
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
