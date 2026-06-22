import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Elysia } from "elysia";

jest.mock("../../lib/auth", () => ({
  auth: {
    api: {
      getSession: jest.fn(async (): Promise<any> => null),
    },
  },
}));

jest.mock("../../lib/prisma", () => ({
  prisma: {},
}));

jest.mock("../../lib/passkey-step-up", () => ({
  hasVerifiedPasskeyStepUp: jest.fn(() => false),
  getPasskeyStepUpStatus: jest.fn(async () => ({
    hasPasskeys: false,
    isPasskeyStepUpVerified: false,
    requiresPasskeyStepUp: false,
  })),
}));

import { auth } from "../../lib/auth";
import {
  getPasskeyStepUpStatus,
  hasVerifiedPasskeyStepUp,
} from "../../lib/passkey-step-up";
import { requireAuth } from "../../lib/auth-guard";

const mockGetSession = auth.api.getSession as unknown as jest.Mock<
  () => Promise<any>
>;
const mockHasVerifiedPasskeyStepUp =
  hasVerifiedPasskeyStepUp as jest.MockedFunction<
    typeof hasVerifiedPasskeyStepUp
  >;
const mockGetPasskeyStepUpStatus =
  getPasskeyStepUpStatus as jest.MockedFunction<typeof getPasskeyStepUpStatus>;

const authApp = new Elysia()
  .use(requireAuth)
  .get("/protected", ({ routeUser }) => ({ id: routeUser.id }));

describe("requireAuth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when no session is available", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await authApp.handle(
      new Request("http://localhost/protected"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Unauthorized",
      statusCode: 401,
    });
  });

  it("resolves routeUser from better-auth session", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-2", email: "fallback@example.com" },
      session: { id: "session-2" },
    });

    const response = await authApp.handle(
      new Request("http://localhost/protected"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: "user-2" });
  });

  it("returns 403 when passkey step-up is required", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "user@example.com" },
      session: { id: "session-1" },
    });
    mockGetPasskeyStepUpStatus.mockResolvedValueOnce({
      hasPasskeys: true,
      isPasskeyStepUpVerified: false,
      requiresPasskeyStepUp: true,
    });

    const response = await authApp.handle(
      new Request("http://localhost/protected"),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Forbidden",
      message: "Passkey verification required.",
      statusCode: 403,
    });
  });

  it("skips passkey database checks when the verification cookie is present", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "user@example.com" },
      session: { id: "session-1" },
    });
    mockHasVerifiedPasskeyStepUp.mockReturnValueOnce(true);

    const response = await authApp.handle(
      new Request("http://localhost/protected"),
    );

    expect(response.status).toBe(200);
    expect(mockGetPasskeyStepUpStatus).not.toHaveBeenCalled();
  });
});
