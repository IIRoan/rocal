import {
  PASSKEY_STEP_UP_COOKIE_NAME,
  ensureSessionTokenCookie,
  hasPasskeyStepUpCookie,
  hasSessionTokenCookie,
  parseSessionCookie,
  persistPasskeyStepUpCookie,
  persistSessionTokenCookie,
} from "./session-cookie";
import { setFallbackSessionToken } from "./session-token-fallback";

jest.mock("./secure-store-chunked", () => ({
  getChunkedSecureValueSync: jest.fn(() => "{}"),
  readChunkedSecureValue: jest.fn(async () => "{}"),
  readRawSecureValue: jest.fn(async () => "{}"),
  writeChunkedSecureValue: jest.fn(async () => undefined),
}));

jest.mock("./constants", () => ({
  AUTH_STORAGE_PREFIX: "solace",
  API_BASE_URL: "https://api.solace.onl",
}));

import {
  readChunkedSecureValue,
  writeChunkedSecureValue,
} from "./secure-store-chunked";

describe("session cookie helpers", () => {
  beforeEach(() => {
    setFallbackSessionToken(null);
    jest.mocked(readChunkedSecureValue).mockResolvedValue("{}");
    jest.mocked(writeChunkedSecureValue).mockClear();
  });

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
    expect(hasPasskeyStepUpCookie(raw)).toBe(true);
  });

  it("persists the passkey step-up cookie into the native auth jar", async () => {
    jest.mocked(readChunkedSecureValue).mockResolvedValue(
      JSON.stringify({
        "better-auth.session_token": {
          value: "session-token",
          expires: null,
        },
      }),
    );

    await persistPasskeyStepUpCookie();

    expect(writeChunkedSecureValue).toHaveBeenCalledWith(
      "solace_cookie",
      expect.stringContaining(`"${PASSKEY_STEP_UP_COOKIE_NAME}"`),
    );

    const written = JSON.parse(
      jest.mocked(writeChunkedSecureValue).mock.calls[0]?.[1] as string,
    ) as Record<string, { value: string }>;

    expect(written[PASSKEY_STEP_UP_COOKIE_NAME]?.value).toBe("verified");
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
});
