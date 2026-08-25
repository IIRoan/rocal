import {
  PASSKEY_STEP_UP_COOKIE_NAME,
  hasPasskeyStepUpCookie,
  parseSessionCookie,
  persistPasskeyStepUpCookie,
} from "./session-cookie";

jest.mock("./secure-store-chunked", () => ({
  getChunkedSecureValueSync: jest.fn(() => "{}"),
  readChunkedSecureValue: jest.fn(async () => "{}"),
  writeChunkedSecureValue: jest.fn(async () => undefined),
}));

jest.mock("./constants", () => ({
  AUTH_STORAGE_PREFIX: "solace",
}));

import {
  readChunkedSecureValue,
  writeChunkedSecureValue,
} from "./secure-store-chunked";

describe("session cookie helpers", () => {
  beforeEach(() => {
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
});
