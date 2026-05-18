import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../lib/auth", () => ({
  auth: {
    api: {
      getSession: jest.fn(async (): Promise<any> => null),
    },
  },
}));

import { auth } from "../../lib/auth";
import { UnauthorizedError } from "../../lib/errors";
import { requireAuth } from "../../lib/auth-guard";

const mockGetSession = auth.api.getSession as unknown as jest.Mock<
  () => Promise<any>
>;
const deriveHook = requireAuth.event.transform![0]!.fn as (
  ctx: any,
) => Promise<any>;
const beforeHandleHook = requireAuth.event.beforeHandle![0]!.fn as (
  ctx: any,
) => void;

describe("requireAuth", () => {
  it("returns the existing authenticatedUser from context", async () => {
    await expect(
      deriveHook({
        authenticatedUser: { id: "user-1", email: "user@example.com" },
        request: new Request("http://localhost"),
      }),
    ).resolves.toEqual({
      authenticatedUser: { id: "user-1", email: "user@example.com" },
    });

    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("falls back to auth.api.getSession when user is missing", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-2", email: "fallback@example.com" },
      session: { id: "session-2" },
    });

    await expect(
      deriveHook({
        request: new Request("http://localhost"),
      }),
    ).resolves.toEqual({
      authenticatedUser: { id: "user-2", email: "fallback@example.com" },
    });
  });

  it("returns null auth data when fallback session lookup fails or is missing", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    await expect(
      deriveHook({
        request: new Request("http://localhost"),
      }),
    ).resolves.toEqual({
      authenticatedUser: null,
    });

    mockGetSession.mockRejectedValueOnce(new Error("session failed"));

    await expect(
      deriveHook({
        request: new Request("http://localhost"),
      }),
    ).resolves.toEqual({
      authenticatedUser: null,
    });
  });

  it("throws UnauthorizedError when beforeHandle receives no valid user", () => {
    expect(() => beforeHandleHook({ authenticatedUser: null })).toThrow(
      UnauthorizedError,
    );
    expect(() => beforeHandleHook({ authenticatedUser: {} })).toThrow(
      "Unauthorized access",
    );
  });

  it("allows requests with a valid user id", () => {
    expect(() =>
      beforeHandleHook({ authenticatedUser: { id: "user-1" } }),
    ).not.toThrow();
  });

  it("normalizes a legacy user context into authenticatedUser", async () => {
    const user = { id: "user-1", email: "user@example.com" };

    await expect(
      deriveHook({
        user,
        request: new Request("http://localhost"),
      }),
    ).resolves.toEqual({
      authenticatedUser: user,
    });
  });
});
