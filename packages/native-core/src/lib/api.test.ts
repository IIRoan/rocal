import { MailTrustApiService } from "@workspace/calendar-client";
import {
  activateSessionData,
  captureSessionDataScope,
  isSessionDataScopeCurrent,
  closeSessionData,
} from "./session-data-lifecycle";
import { httpClient } from "./api";
import { authClient } from "./auth-client";
import { triggerSessionClear } from "./session-clear";

const mockGetSessionCookieAsync = jest
  .fn(async () => "better-auth.session_token=fixture-token")
  .mockResolvedValue("better-auth.session_token=fixture-token");

jest.mock("expo-linking", () => ({ createURL: () => "solace://" }));
jest.mock("./auth-client", () => ({ authClient: { getSession: jest.fn() } }));
jest.mock("./session-cookie", () => ({
  getSessionCookie: () => "better-auth.session_token=fixture-token",
  getSessionCookieAsync: () => mockGetSessionCookieAsync(),
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

describe("trust requests awaiting the actual native auth-header resolver", () => {
  const originalFetch = globalThis.fetch;
  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await closeSessionData();
  });
  it.each([
    ["get", "different-account"],
    ["put", "different-account"],
    ["get", "same-account"],
    ["put", "same-account"],
  ] as const)(
    "does not dispatch %s after %s clear/relogin during SecureStore cookie resolution",
    async (method, nextAccount) => {
      activateSessionData("SYNTHETIC-original-owner");
      const scope = captureSessionDataScope();
      let resume: ((cookie: string) => void) | undefined;
      let entered: (() => void) | undefined;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      mockGetSessionCookieAsync.mockImplementationOnce(() => {
        entered?.();
        return new Promise((resolve) => {
          resume = resolve;
        });
      });
      globalThis.fetch = jest.fn(async () =>
        Response.json({
          encryptedTrust: "mt1.SYNTHETIC-old-account-ciphertext",
        }),
      );
      const service = new MailTrustApiService(httpClient, () =>
        isSessionDataScopeCurrent(scope),
      );
      const pending =
        method === "get"
          ? service.get()
          : service.put({
              encryptedTrust: "mt1.SYNTHETIC-old-account-ciphertext",
              expectedEncryptedTrust: null,
            });
      const rejected = expect(pending).rejects.toThrow("session changed");
      await started;
      await closeSessionData();
      activateSessionData(
        nextAccount === "same-account"
          ? "SYNTHETIC-original-owner"
          : "SYNTHETIC-other-owner",
      );
      resume?.("better-auth.session_token=SYNTHETIC-new-session-cookie");
      await rejected;
      expect(globalThis.fetch).not.toHaveBeenCalled();
    },
  );
});
