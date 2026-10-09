import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { accountPublicRoutes } from "../../routes/account-public";
import { auth } from "../../lib/auth";
import { getPasskeyStepUpStatus } from "../../lib/passkey-step-up";

jest.mock("../../lib/auth", () => ({
  auth: { api: { getSession: jest.fn() } },
}));
jest.mock("../../lib/prisma", () => ({ prisma: {} }));
jest.mock("../../lib/passkey-step-up", () => ({
  getPasskeyStepUpStatus: jest.fn(),
}));
jest.mock("../../services/account.service", () => ({
  AccountService: jest.fn(() => ({})),
}));
jest.mock("../../lib/invite-service", () => ({ inviteService: {} }));

const mockGetSession = jest.mocked(auth.api.getSession);
const mockGetStepUp = jest.mocked(getPasskeyStepUpStatus);

describe("auth-status cookie propagation", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("forwards every renewed cookie while checking passkey state", async () => {
    const cookies = [
      "session_token=fixture-token; Path=/; HttpOnly; Secure; SameSite=Lax",
      "session_data=fixture-data; Expires=Thu, 08 Oct 2026 20:00:00 GMT; Path=/; HttpOnly",
    ];
    const headers = new Headers({ "x-internal-header": "fixture-internal" });
    for (const cookie of cookies) headers.append("set-cookie", cookie);
    mockGetSession.mockResolvedValueOnce({
      headers,
      response: { user: { id: "user-1" }, session: { id: "session-1" } },
    } as never);
    mockGetStepUp.mockResolvedValueOnce({
      hasPasskeys: true,
      isPasskeyStepUpVerified: false,
      requiresPasskeyStepUp: true,
    });
    const response = await accountPublicRoutes.handle(
      new Request("http://localhost/account/auth-status"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual(cookies);
    expect(response.headers.has("x-internal-header")).toBe(false);
    expect(mockGetSession).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      query: { disableCookieCache: true },
      returnHeaders: true,
    });
    await expect(response.json()).resolves.toEqual({
      authenticated: true,
      hasPasskeys: true,
      requiresPasskeyStepUp: true,
    });
  });

  it("forwards cookie clears from an unauthenticated status check", async () => {
    const cookie = "session_token=; Max-Age=0; Path=/; HttpOnly";
    mockGetSession.mockResolvedValueOnce({
      headers: new Headers({ "set-cookie": cookie }),
      response: null,
    } as never);
    const response = await accountPublicRoutes.handle(
      new Request("http://localhost/account/auth-status"),
    );
    expect(response.headers.getSetCookie()).toEqual([cookie]);
    expect(mockGetStepUp).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      authenticated: false,
      hasPasskeys: false,
      requiresPasskeyStepUp: false,
    });
  });
});
