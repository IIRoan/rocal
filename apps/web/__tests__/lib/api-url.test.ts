import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  getApiBaseUrl,
  getAppBaseUrl,
  getAuthCallbackUrl,
  getSafeAuthCallbackUrl,
  resolveAuthRedirectTarget,
} from "../../lib/api-url";

const originalEnv = {
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
};

type TestGlobal = typeof globalThis & {
  window?: Window & typeof globalThis;
};

const testGlobal = globalThis as TestGlobal;
const originalWindow = testGlobal.window;

describe("api-url helpers", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete testGlobal.window;
  });

  afterEach(() => {
    if (originalWindow) {
      testGlobal.window = originalWindow;
    } else {
      delete testGlobal.window;
    }

    process.env.NEXT_PUBLIC_API_URL = originalEnv.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_APP_URL = originalEnv.NEXT_PUBLIC_APP_URL;
  });

  it("prefers NEXT_PUBLIC_API_URL when provided", () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.solace.test";

    expect(getApiBaseUrl()).toBe("https://api.solace.test");
  });

  it("falls back to localhost when no env is set", () => {
    expect(getApiBaseUrl()).toBe("http://localhost:4001");
  });

  it("uses NEXT_PUBLIC_APP_URL as the app base url", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.solace.test";

    expect(getAppBaseUrl()).toBe("https://app.solace.test");
  });

  it("falls back to the configured app url for auth callbacks", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.solace.test";

    expect(getAuthCallbackUrl("/settings?tab=security")).toBe(
      "https://app.solace.test/settings?tab=security",
    );
  });

  it("rejects callback urls from untrusted origins", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.solace.test";
    process.env.NEXT_PUBLIC_API_URL = "https://api.solace.test";

    expect(getSafeAuthCallbackUrl("https://evil.test/steal")).toBeNull();
  });

  it("accepts relative callback urls and resolves them against the app origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.solace.test";

    expect(getSafeAuthCallbackUrl("/dashboard?from=signin")).toBe(
      "https://app.solace.test/dashboard?from=signin",
    );
  });

  it("returns an internal redirect target when the callback stays on the app origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.solace.test";

    expect(
      resolveAuthRedirectTarget("/fallback", "https://app.solace.test/settings#security"),
    ).toEqual({
      href: "/settings#security",
      external: false,
    });
  });

  it("returns an external redirect target when the callback points at the api origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.solace.test";
    process.env.NEXT_PUBLIC_API_URL = "https://api.solace.test";

    expect(
      resolveAuthRedirectTarget("/fallback", "https://api.solace.test/auth/callback?ok=1"),
    ).toEqual({
      href: "https://api.solace.test/auth/callback?ok=1",
      external: true,
    });
  });

  it("falls back to a safe relative next path when the callback is invalid", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.solace.test";

    expect(
      resolveAuthRedirectTarget("https://evil.test/phish", "http://[::1"),
    ).toEqual({
      href: "/dashboard",
      external: false,
    });
  });
});
