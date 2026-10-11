import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Elysia } from "elysia";

jest.mock("../../lib/auth", () => ({
  auth: {
    api: {
      getSession: jest.fn(),
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

const mockGetSession = jest.mocked(auth.api.getSession);
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
    mockGetSession.mockResolvedValue({ headers: new Headers(), response: null } as never);

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
    mockGetSession.mockResolvedValue({ headers: new Headers(), response: {
      user: { id: "user-2", email: "fallback@example.com" },
      session: { id: "session-2" },
    } } as never);

    const response = await authApp.handle(
      new Request("http://localhost/protected"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: "user-2" });
  });

  it("returns 403 when passkey step-up is required", async () => {
    mockGetSession.mockResolvedValue({ headers: new Headers(), response: {
      user: { id: "user-1", email: "user@example.com" },
      session: { id: "session-1" },
    } } as never);
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
      details: { code: "PASSKEY_STEP_UP_REQUIRED" },
    });
  });

  it("skips passkey database checks when the verification cookie is present", async () => {
    mockGetSession.mockResolvedValue({ headers: new Headers(), response: {
      user: { id: "user-1", email: "user@example.com" },
      session: { id: "session-1" },
    } } as never);
    mockHasVerifiedPasskeyStepUp.mockReturnValueOnce(true);

    const response = await authApp.handle(
      new Request("http://localhost/protected"),
    );

    expect(response.status).toBe(200);
    expect(mockGetPasskeyStepUpStatus).not.toHaveBeenCalled();
  });

  it("forwards renewed cookies without performing a second session read", async () => {
    const cookies = ["session_token=fixture; Max-Age=1209600; HttpOnly", "solace-passkey-step-up=fixture-verification; Max-Age=1209600; HttpOnly"];
    const headers = new Headers();
    for (const cookie of cookies) headers.append("set-cookie", cookie);
    mockGetSession.mockResolvedValue({ headers, response: { user: { id: "user-1" }, session: { id: "session-1" } } } as never);
    const response = await authApp.handle(new Request("http://localhost/protected"));
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual(cookies);
    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(mockGetSession).toHaveBeenCalledWith({ headers: expect.any(Headers), returnHeaders: true });
  });
});
