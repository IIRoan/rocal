import { describe, expect, it, jest } from "@jest/globals";

jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    ok: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    skip: jest.fn(),
    step: jest.fn(),
    child: jest.fn(),
  }),
}));

jest.mock("../../lib/auth", () => ({
  auth: {
    api: {
      getSession: jest.fn(async (): Promise<any> => undefined),
    },
  },
}));

import { auth } from "../../lib/auth";
import { ensureAuthenticatedUser } from "../../lib/auth-utils";

const mockGetSession = auth.api.getSession as jest.Mock<() => Promise<any>>;

describe("ensureAuthenticatedUser", () => {
  it("returns the existing user when the context already has an id", async () => {
    const user = { id: "user-1", email: "user@example.com" };

    await expect(
      ensureAuthenticatedUser(user, new Request("http://localhost")),
    ).resolves.toBe(user);
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("falls back to the auth session when the context user is missing", async () => {
    const sessionUser = { id: "user-2", email: "fallback@example.com" };
    mockGetSession.mockResolvedValue({ user: sessionUser });

    await expect(
      ensureAuthenticatedUser(null, new Request("http://localhost")),
    ).resolves.toEqual(sessionUser);
  });

  it("logs the fallback failure and throws when the user cannot be resolved", async () => {
    mockGetSession.mockRejectedValue(new Error("session unavailable"));

    await expect(
      ensureAuthenticatedUser(null, new Request("http://localhost")),
    ).rejects.toThrow("User context missing");
  });
});
