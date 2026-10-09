import { httpClient } from "./api";
import { authClient } from "./auth-client";
import { triggerSessionClear } from "./session-clear";

jest.mock("expo-linking", () => ({ createURL: () => "solace://" }));
jest.mock("./auth-client", () => ({ authClient: { getSession: jest.fn() } }));
jest.mock("./session-cookie", () => ({
  getSessionCookie: () => "better-auth.session_token=fixture-token",
  getSessionCookieAsync: async () => "better-auth.session_token=fixture-token",
  persistSessionTokenCookie: async () => {},
  persistRenewedSessionCookie: async () => {},
}));
jest.mock("./session-token-fallback", () => ({
  getFallbackSessionToken: () => "fixture-token",
}));
jest.mock("./session-clear", () => ({ triggerSessionClear: jest.fn() }));

describe("native session validation after 401", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it.each([true, false])(
    "only clears an authoritatively expired session; unavailable=%s",
    async (unavailable) => {
      jest.mocked(authClient.getSession).mockResolvedValue({
        data: null,
        error: unavailable
          ? { status: 503, message: "Fixture unavailable" }
          : null,
      } as never);
      globalThis.fetch = jest.fn(async () =>
        Response.json(
          {
            error: "Unauthorized",
            message: "Authentication required",
            statusCode: 401,
          },
          { status: 401 },
        ),
      );
      await expect(
        httpClient.get("/protected", { retries: 0 }),
      ).rejects.toMatchObject({ statusCode: 401 });
      for (let i = 0; i < 4; i += 1) await Promise.resolve();
      expect(authClient.getSession).toHaveBeenCalledWith({
        query: { disableCookieCache: true },
      });
      expect(triggerSessionClear).toHaveBeenCalledTimes(unavailable ? 0 : 1);
    },
  );
});
