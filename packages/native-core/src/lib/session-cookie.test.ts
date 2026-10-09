import {
  PASSKEY_STEP_UP_COOKIE_NAME,
  ensureSessionTokenCookie,
  hasSessionTokenCookie,
  parseSessionCookie,
  persistSessionTokenCookie,
  persistRenewedSessionCookie,
} from "./session-cookie";
import { setFallbackSessionToken } from "./session-token-fallback";
import {
  readChunkedSecureValue,
  getChunkedSecureValueSync,
  writeChunkedSecureValue,
  setChunkedSecureValueSync,
} from "./secure-store-chunked";

jest.mock("react-native", () => ({ Platform: { OS: "web" } }));
jest.mock("expo-linking", () => ({}));

jest.mock("./secure-store-chunked", () => ({
  getChunkedSecureValueSync: jest.fn(() => "{}"),
  readChunkedSecureValue: jest.fn(async () => "{}"),
  readRawSecureValue: jest.fn(async () => "{}"),
  writeChunkedSecureValue: jest.fn(async () => undefined),
  setChunkedSecureValueSync: jest.fn(),
}));

jest.mock("./constants", () => ({
  AUTH_STORAGE_PREFIX: "solace",
  API_BASE_URL: "https://api.solace.onl",
}));

describe("session cookie helpers", () => {
  beforeEach(() => {
    setFallbackSessionToken(null);
    jest.mocked(readChunkedSecureValue).mockResolvedValue("{}");
    jest.mocked(getChunkedSecureValueSync).mockReturnValue("{}");
    jest.mocked(writeChunkedSecureValue).mockReset().mockResolvedValue(undefined);
    jest.mocked(setChunkedSecureValueSync).mockReset();
  });

  afterEach(() => { jest.useRealTimers(); });

  it("includes the passkey step-up cookie in parsed auth headers", () => {
    const raw = JSON.stringify({
      "better-auth.session_token": {
        value: "session-token",
        expires: null,
      },
      [PASSKEY_STEP_UP_COOKIE_NAME]: {
        value: "verified",
        expires: null,
      },
    });

    expect(parseSessionCookie(raw)).toBe(
      "better-auth.session_token=session-token; solace-passkey-step-up=verified",
    );
  });

  it("falls back to an in-memory session token when the jar is empty", () => {
    setFallbackSessionToken("memory-token");
    expect(parseSessionCookie("{}")).toBe(
      "__Secure-better-auth.session_token=memory-token",
    );
  });

  it("does not treat a bare digit string as a cookie jar", () => {
    expect(parseSessionCookie("1")).toBe("");
    expect(hasSessionTokenCookie("1")).toBe(false);
  });

  it("persists a secure session token when the jar is empty", async () => {
    await persistSessionTokenCookie("fresh-token", { preferSecure: true });

    const written = JSON.parse(
      jest.mocked(writeChunkedSecureValue).mock.calls[0]?.[1] as string,
    ) as Record<string, { value: string }>;

    expect(written["__Secure-better-auth.session_token"]?.value).toBe(
      "fresh-token",
    );
    expect(
      hasSessionTokenCookie(
        jest.mocked(writeChunkedSecureValue).mock.calls[0]?.[1] as string,
      ),
    ).toBe(true);
  });

  it("skips rewriting when the jar already has the same session token", async () => {
    jest.mocked(readChunkedSecureValue).mockResolvedValue(
      JSON.stringify({
        "__Secure-better-auth.session_token": {
          value: "fresh-token",
          expires: null,
        },
      }),
    );

    await expect(ensureSessionTokenCookie("fresh-token")).resolves.toBe(true);
    expect(writeChunkedSecureValue).not.toHaveBeenCalled();
  });

  it("keeps an existing session cookie instead of overwriting it with the auth payload token", async () => {
    jest.mocked(readChunkedSecureValue).mockResolvedValue(
      JSON.stringify({
        "__Secure-better-auth.session_token": {
          value: "signed-cookie-value",
          expires: null,
        },
      }),
    );

    await expect(ensureSessionTokenCookie("fresh-token")).resolves.toBe(true);
    expect(writeChunkedSecureValue).not.toHaveBeenCalled();
  });

  it("saves renewed session and signed passkey cookies with their server expiry", async () => {
    const raw = JSON.stringify({ "better-auth.session_token": { value: "current-token", expires: null } });
    jest.mocked(readChunkedSecureValue).mockResolvedValue(raw);
    jest.mocked(getChunkedSecureValueSync).mockReturnValue(raw);
    const headers = new Headers();
    headers.append("set-cookie", "better-auth.session_token=current-token; Max-Age=1209600; HttpOnly");
    headers.append("set-cookie", "solace-passkey-step-up=signed-verification; Expires=Thu, 22 Oct 2026 12:00:00 GMT; HttpOnly");
    await persistRenewedSessionCookie(headers, new Headers({ cookie: "better-auth.session_token=current-token" }));
    const stored: Record<string, { value: string; expires: string }> = JSON.parse(jest.mocked(setChunkedSecureValueSync).mock.calls[0]?.[1] ?? "{}");
    expect(stored["better-auth.session_token"]?.value).toBe("current-token");
    expect(Date.parse(stored["better-auth.session_token"]?.expires ?? "") - Date.now()).toBeGreaterThan(13 * 24 * 60 * 60 * 1000);
    expect(stored["solace-passkey-step-up"]?.value).toBe("signed-verification");
  });

  it("ignores renewal from a previous account and after sign-out", async () => {
    const raw = JSON.stringify({ "better-auth.session_token": { value: "new-token", expires: null } });
    jest.mocked(readChunkedSecureValue).mockResolvedValue(raw);
    jest.mocked(getChunkedSecureValueSync).mockReturnValue(raw);
    const headers = new Headers({ "set-cookie": "better-auth.session_token=old-token; Max-Age=1209600" });
    const request = new Headers({ cookie: "better-auth.session_token=old-token" });
    await persistRenewedSessionCookie(headers, request);
    jest.mocked(readChunkedSecureValue).mockResolvedValue("{}");
    jest.mocked(getChunkedSecureValueSync).mockReturnValue("{}");
    await persistRenewedSessionCookie(headers, request);
    expect(writeChunkedSecureValue).not.toHaveBeenCalled();
    expect(setChunkedSecureValueSync).not.toHaveBeenCalled();
  });

  it("cannot restore a cookie when logout interrupts a pending storage write", async () => {
    let jar = JSON.stringify({ "better-auth.session_token": { value: "current-token", expires: null } });
    jest.mocked(readChunkedSecureValue).mockImplementation(async () => jar);
    jest.mocked(getChunkedSecureValueSync).mockImplementation(() => jar);
    jest.mocked(writeChunkedSecureValue).mockImplementation(async (_key, value) => {
      await Promise.resolve();
      await Promise.resolve();
      jar = value;
    });
    jest.mocked(setChunkedSecureValueSync).mockImplementation((_key, value) => { jar = value; });
    const pending = persistRenewedSessionCookie(
      new Headers({ "set-cookie": "better-auth.session_token=current-token; Max-Age=1209600" }),
      new Headers({ cookie: "better-auth.session_token=current-token" }),
    );
    await Promise.resolve();
    jar = "{}";
    setFallbackSessionToken(null);
    await pending;
    expect(parseSessionCookie(jar)).toBe("");
  });

  it("retains the app session when the server clears passkey verification", async () => {
    const raw = JSON.stringify({
      "better-auth.session_token": { value: "current-token", expires: null },
      [PASSKEY_STEP_UP_COOKIE_NAME]: { value: "signed-verification", expires: null },
    });
    jest.mocked(readChunkedSecureValue).mockResolvedValue(raw);
    jest.mocked(getChunkedSecureValueSync).mockReturnValue(raw);
    await persistRenewedSessionCookie(
      new Headers({ "set-cookie": `${PASSKEY_STEP_UP_COOKIE_NAME}=; Max-Age=0; HttpOnly` }),
      new Headers({ cookie: "better-auth.session_token=current-token" }),
    );
    expect(parseSessionCookie(jest.mocked(setChunkedSecureValueSync).mock.calls[0]?.[1])).toBe("better-auth.session_token=current-token");
  });

  it("rejects a response that replaces the session token during ordinary renewal", async () => {
    const raw = JSON.stringify({ "better-auth.session_token": { value: "current-token", expires: null } });
    jest.mocked(readChunkedSecureValue).mockResolvedValue(raw);
    jest.mocked(getChunkedSecureValueSync).mockReturnValue(raw);
    await persistRenewedSessionCookie(
      new Headers({ "set-cookie": "better-auth.session_token=other-token; Max-Age=1209600" }),
      new Headers({ cookie: "better-auth.session_token=current-token" }),
    );
    expect(setChunkedSecureValueSync).not.toHaveBeenCalled();
  });

  it("gives fallback session cookies exactly two weeks of validity", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-09T12:00:00Z"));
    await persistSessionTokenCookie("fixture-token");
    const stored: Record<string, { value: string; expires: string }> = JSON.parse(jest.mocked(writeChunkedSecureValue).mock.calls[0]?.[1] ?? "{}");
    expect(stored["__Secure-better-auth.session_token"]?.expires).toBe("2026-10-23T12:00:00.000Z");
  });

  it.each(["better-auth.session_data", PASSKEY_STEP_UP_COOKIE_NAME])(
    "preserves a concurrently updated %s cookie when renewing the session",
    async (cookieName) => {
      const original = {
        "better-auth.session_token": { value: "current-token", expires: null },
        [cookieName]: { value: "old-cookie", expires: null },
      };
      const snapshot = JSON.stringify(original);
      let jar = snapshot;
      let completeRead: (value: string) => void = () => {};
      jest.mocked(readChunkedSecureValue).mockImplementationOnce(() =>
        new Promise<string>((resolve) => {
          completeRead = resolve;
        }),
      );
      jest.mocked(getChunkedSecureValueSync).mockImplementation(() => jar);
      jest.mocked(setChunkedSecureValueSync).mockImplementation((_key, value) => {
        jar = value;
      });
      const pending = persistRenewedSessionCookie(
        new Headers({ "set-cookie": "better-auth.session_token=current-token; Max-Age=1209600" }),
        new Headers({ cookie: "better-auth.session_token=current-token" }),
      );
      jar = JSON.stringify({
        ...original,
        [cookieName]: { value: "new-cookie", expires: null },
      });
      completeRead(snapshot);
      await pending;
      const stored: Record<string, { value: string; expires: string | null }> =
        JSON.parse(jar);
      expect(stored[cookieName]?.value).toBe("new-cookie");
      expect(stored["better-auth.session_token"]?.value).toBe("current-token");
      expect(stored["better-auth.session_token"]?.expires).not.toBeNull();
    },
  );
});
