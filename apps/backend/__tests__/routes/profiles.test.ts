import { describe, expect, it, jest } from "@jest/globals";
import { Elysia } from "elysia";

jest.mock("../../lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: jest.fn(async (): Promise<any> => null),
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
import { profilesRoutes } from "../../routes/profiles";

const mockPrisma = prisma as unknown as {
  user: {
    findFirst: jest.Mock<() => Promise<any>>;
  };
};

function createApp() {
  return new Elysia({ normalize: false }).use(errorHandler).use(profilesRoutes);
}

describe("profilesRoutes", () => {
  it("returns avatar proxy paths for matching Solace users", async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce({
      email: "alice@example.com",
      image: "https://cdn.example.com/alice.png",
      mailDirectoryEntry: null,
    });

    const response = await createApp().handle(
      new Request("http://localhost/profiles/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emails: ["alice@example.com"] }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      profiles: [
        {
          email: "alice@example.com",
          image: "/api/profiles/avatar?email=alice%40example.com",
        },
      ],
    });
  });

  it("returns 404 when no avatar exists for the requested email", async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce(null);

    const response = await createApp().handle(
      new Request(
        "http://localhost/profiles/avatar?email=missing%40example.com",
      ),
    );

    expect(response.status).toBe(404);
  });

  it("rejects oversized lookup batches", async () => {
    const emails = Array.from({ length: 51 }, (_, index) => `u${index}@ex.com`);
    const response = await createApp().handle(
      new Request("http://localhost/profiles/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emails }),
      }),
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
