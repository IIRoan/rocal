import { describe, expect, it, jest } from "@jest/globals";
import { auth } from "../../lib/auth";
import { getRequestAuthSession } from "../../lib/auth-session";

jest.mock("../../lib/auth", () => ({
  auth: { api: { getSession: jest.fn() } },
}));

const mockGetSession = jest.mocked(auth.api.getSession);

describe("request session renewal headers", () => {
  it.each([undefined, "existing=fixture; Path=/", ["existing=fixture; Path=/"]])(
    "appends renewal cookies without losing existing headers: %j",
    async (existing) => {
      const cookies = [
        "better-auth.session_token=fixture; Max-Age=1209600; HttpOnly",
        "solace-passkey-step-up=fixture; Expires=Thu, 22 Oct 2026 12:00:00 GMT; HttpOnly",
      ];
      const headers = new Headers();
      for (const cookie of cookies) headers.append("set-cookie", cookie);
      const session = { user: { id: "user-1" }, session: { id: "session-1" } };
      mockGetSession.mockResolvedValueOnce({ headers, response: session } as never);
      const responseHeaders: Record<string, unknown> = {
        "set-cookie": existing,
        "Cache-Control": "no-store",
      };
      const request = new Request("https://fixture.test/protected");

      await expect(getRequestAuthSession(request, responseHeaders)).resolves.toBe(session);
      expect(responseHeaders["set-cookie"]).toEqual([
        ...(typeof existing === "string" ? [existing] : existing ?? []),
        ...cookies,
      ]);
      expect(responseHeaders["Cache-Control"]).toBe("no-store");
      expect(mockGetSession).toHaveBeenCalledTimes(1);
      expect(mockGetSession).toHaveBeenCalledWith({ headers: request.headers, returnHeaders: true });
    },
  );

  it("forwards clears from a revoked session without losing another cookie", async () => {
    const clearingCookie = "better-auth.session_token=; Max-Age=0; HttpOnly";
    mockGetSession.mockResolvedValueOnce({
      headers: new Headers({ "set-cookie": clearingCookie }),
      response: null,
    } as never);
    const responseHeaders: Record<string, unknown> = { "set-cookie": "another=fixture" };
    await expect(getRequestAuthSession(new Request("https://fixture.test"), responseHeaders)).resolves.toBeNull();
    expect(responseHeaders["set-cookie"]).toEqual(["another=fixture", clearingCookie]);
  });

  it("preserves response headers when no renewal is due", async () => {
    mockGetSession.mockResolvedValueOnce({ headers: new Headers(), response: null } as never);
    const responseHeaders: Record<string, unknown> = { "set-cookie": "another=fixture" };
    await getRequestAuthSession(new Request("https://fixture.test"), responseHeaders);
    expect(responseHeaders).toEqual({ "set-cookie": "another=fixture" });
  });

  it("propagates an unavailable session check without clearing client cookies", async () => {
    mockGetSession.mockRejectedValueOnce(new Error("Fixture unavailable"));
    const responseHeaders: Record<string, unknown> = { "set-cookie": "another=fixture" };
    await expect(getRequestAuthSession(new Request("https://fixture.test"), responseHeaders)).rejects.toThrow("Fixture unavailable");
    expect(responseHeaders).toEqual({ "set-cookie": "another=fixture" });
  });
});
