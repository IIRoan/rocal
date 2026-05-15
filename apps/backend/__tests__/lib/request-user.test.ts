import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../lib/auth-utils", () => ({
  ensureAuthenticatedUser: jest.fn(),
}));

import {
  ensureAuthenticatedUser,
  type AuthenticatedUser,
} from "../../lib/auth-utils";
import { resolveRouteUser } from "../../lib/request-user";

const mockEnsureAuthenticatedUser =
  ensureAuthenticatedUser as jest.MockedFunction<
    typeof ensureAuthenticatedUser
  >;

describe("resolveRouteUser", () => {
  it("returns the existing authenticated user without fallback lookup", async () => {
    const user: AuthenticatedUser = {
      id: "user-1",
      email: "user@example.com",
    };
    const request = new Request("http://localhost/events");

    await expect(resolveRouteUser(user, request)).resolves.toBe(user);
    expect(mockEnsureAuthenticatedUser).not.toHaveBeenCalled();
  });

  it("falls back to ensureAuthenticatedUser when authenticatedUser is undefined", async () => {
    const request = new Request("http://localhost/events");
    const user: AuthenticatedUser = { id: "user-2" };
    mockEnsureAuthenticatedUser.mockResolvedValueOnce(user);

    await expect(resolveRouteUser(undefined, request)).resolves.toBe(user);
    expect(mockEnsureAuthenticatedUser).toHaveBeenCalledWith(
      undefined,
      request,
    );
  });

  it("falls back to ensureAuthenticatedUser when authenticatedUser is null", async () => {
    const request = new Request("http://localhost/events");
    const user: AuthenticatedUser = { id: "user-3" };
    mockEnsureAuthenticatedUser.mockResolvedValueOnce(user);

    await expect(resolveRouteUser(null, request)).resolves.toBe(user);
    expect(mockEnsureAuthenticatedUser).toHaveBeenCalledWith(
      undefined,
      request,
    );
  });
});
