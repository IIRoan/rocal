import { describe, expect, it, jest } from "@jest/globals";
import { Elysia } from "elysia";

jest.mock("../../lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async (): Promise<any> => ({ id: "user-1" })),
      delete: jest.fn(async (): Promise<any> => ({ id: "user-1" })),
    },
    mailDirectoryEntry: {
      findUnique: jest.fn(async (): Promise<any> => null),
    },
    calendarSharing: {
      deleteMany: jest.fn(async (): Promise<any> => ({ count: 0 })),
    },
    notificationLog: {
      deleteMany: jest.fn(async (): Promise<any> => ({ count: 0 })),
    },
    $transaction: jest.fn(async (callback: (tx: any) => Promise<any>) =>
      callback(
        (jest.requireMock("../../lib/prisma") as { prisma: any }).prisma,
      ),
    ),
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

import { auth } from "../../lib/auth";
import { errorHandler } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { accountPublicRoutes } from "../../routes/account-public";
import { accountRoutes } from "../../routes/account";

const mockGetSession = jest.mocked(auth.api.getSession);
const mockPrisma = prisma as unknown as {
  user: {
    findUnique: jest.Mock<() => Promise<any>>;
    delete: jest.Mock<() => Promise<any>>;
  };
  mailDirectoryEntry: {
    findUnique: jest.Mock<() => Promise<any>>;
  };
  calendarSharing: {
    deleteMany: jest.Mock<() => Promise<any>>;
  };
  notificationLog: {
    deleteMany: jest.Mock<() => Promise<any>>;
  };
  $transaction: jest.Mock;
};

function createApp() {
  return new Elysia({ normalize: false })
    .use(errorHandler)
    .use(accountPublicRoutes)
    .use(accountRoutes);
}

async function readJson(response: Response) {
  return response.json();
}

describe("accountRoutes", () => {
  it("returns the public signup config", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/account/signup-config"),
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      defaultEmailDomain: "solace.onl",
    });
  });

  it("checks public sign-up email availability", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    mockPrisma.mailDirectoryEntry.findUnique.mockResolvedValueOnce(null);

    const response = await createApp().handle(
      new Request("http://localhost/account/email-availability?email=Roan"),
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      email: "Roan",
      localPart: "roan",
      domain: "solace.onl",
      normalizedEmail: "roan@solace.onl",
      available: true,
      code: "available",
      message: "That email address is available.",
    });
  });

  it("returns an uncached unauthenticated auth-status response", async () => {
    mockGetSession.mockResolvedValueOnce(undefined as never);

    const response = await createApp().handle(
      new Request("http://localhost/account/auth-status"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(mockGetSession).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      query: { disableCookieCache: true },
    });
    await expect(readJson(response)).resolves.toEqual({
      authenticated: false,
      hasPasskeys: false,
      requiresPasskeyStepUp: false,
    });
  });

  it("deletes the authenticated account", async () => {    const response = await createApp().handle(
      new Request("http://localhost/account/", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.calendarSharing.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{ sharedWith: "user-1" }, { sharedBy: "user-1" }],
      },
    });
    expect(mockPrisma.notificationLog.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({
      where: { id: "user-1" },
    });
    await expect(readJson(response)).resolves.toEqual({
      success: true,
      message: "Account deleted successfully",
      deletedUserId: "user-1",
    });
  });
});
