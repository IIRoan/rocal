import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

jest.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: jest.fn(),
  },
}));

import { Capacitor } from "@capacitor/core";
import {
  getApiBaseUrl,
  getAppBaseUrl,
  getAuthCallbackUrl,
  getMobileAuthBridgeUrl,
  getMobileAuthCallbackUrl,
  getSafeAuthCallbackUrl,
  resolveAuthRedirectTarget,
} from "../../lib/api-url";

const mockIsNativePlatform = Capacitor.isNativePlatform as jest.MockedFunction<
  typeof Capacitor.isNativePlatform
>;

const originalEnv = {
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_MOBILE_AUTH_CALLBACK_URL:
    process.env.NEXT_PUBLIC_MOBILE_AUTH_CALLBACK_URL,
};

type TestGlobal = typeof globalThis & {
  window?: Window & typeof globalThis;
};

const testGlobal = globalThis as TestGlobal;
const originalWindow = testGlobal.window;

describe("api-url helpers", () => {
  beforeEach(() => {
    mockIsNativePlatform.mockReturnValue(false);
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_MOBILE_AUTH_CALLBACK_URL;
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
    process.env.NEXT_PUBLIC_MOBILE_AUTH_CALLBACK_URL =
      originalEnv.NEXT_PUBLIC_MOBILE_AUTH_CALLBACK_URL;
  });

  it("prefers NEXT_PUBLIC_API_URL when provided", () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.solace.test";

    expect(getApiBaseUrl()).toBe("https://api.solace.test");
  });

  it("uses the native webview host for API requests on mobile", () => {
    mockIsNativePlatform.mockReturnValue(true);
    testGlobal.window = {
      location: {
        protocol: "https:",
        hostname: "app.solace.test",
      },
    } as Window & typeof globalThis;

    expect(getApiBaseUrl()).toBe("https://app.solace.test:3001");
  });

  it("uses the native webview origin as the app base url on mobile", () => {
    mockIsNativePlatform.mockReturnValue(true);
    testGlobal.window = {
      location: {
        origin: "capacitor://localhost",
      },
    } as Window & typeof globalThis;

    expect(getAppBaseUrl()).toBe("capacitor://localhost");
  });

  it("falls back to the configured app url for auth callbacks", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.solace.test";

    expect(getAuthCallbackUrl("/settings?tab=security")).toBe(
      "https://app.solace.test/settings?tab=security",
    );
  });

  it("sanitizes non-relative next paths in mobile callback urls", () => {
    expect(
      getMobileAuthCallbackUrl("https://evil.test/phish", "access_denied", "ott-1"),
    ).toBe(
      "app.solace.onl://api/auth?next=%2Fdashboard&error=access_denied&ott=ott-1",
    );
  });

  it("falls back to the default callback base when the configured one is invalid", () => {
    process.env.NEXT_PUBLIC_MOBILE_AUTH_CALLBACK_URL = "::not-a-url::";

    expect(getMobileAuthCallbackUrl("/calendar")).toBe(
      "app.solace.onl://api/auth?next=%2Fcalendar",
    );
  });

  it("builds the mobile auth bridge url against the app origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.solace.test";

    expect(getMobileAuthBridgeUrl("/calendar", "expired_session")).toBe(
      "https://app.solace.test/auth/mobile-complete?next=%2Fcalendar&error=expired_session",
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
