import { describe, expect, it } from "@jest/globals";

import {
  collectLegacyAuthCookieNames,
  expireLegacyHostScopedAuthCookies,
} from "../../lib/auth-cookie-migration";

function getSetCookies(headers: Headers): string[] {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const raw = headers.get("set-cookie");
  return raw ? [raw] : [];
}

describe("auth cookie migration", () => {
  it("collects default Better Auth cookie names plus request chunks", () => {
    const request = new Request("https://api.solace.onl", {
      headers: {
        cookie:
          "__Secure-better-auth.session_token=abc; __Secure-better-auth.session_data.0=chunk; other=1",
      },
    });

    expect(
      collectLegacyAuthCookieNames({
        request,
        isProduction: true,
      }),
    ).toEqual(
      expect.arrayContaining([
        "__Secure-better-auth.session_token",
        "__Secure-better-auth.session_data",
        "__Secure-better-auth.session_data.0",
        "__Secure-better-auth.dont_remember",
        "__Secure-better-auth.account_data",
      ]),
    );
  });

  it("expires host-scoped and host-only variants when root domain differs", () => {
    const headers = new Headers();

    expireLegacyHostScopedAuthCookies(
      { headers },
      {
        backendUrl: "https://api.solace.onl",
        isProduction: true,
        cookieSameSite: "lax",
        request: new Request("https://api.solace.onl", {
          headers: {
            cookie: "__Secure-better-auth.session_token=stale",
          },
        }),
      },
    );

    const cookies = getSetCookies(headers);

    expect(
      cookies.some(
        (entry) =>
          entry.startsWith("__Secure-better-auth.session_token=") &&
          entry.includes("Max-Age=0") &&
          entry.includes("Domain=api.solace.onl"),
      ),
    ).toBe(true);

    expect(
      cookies.some(
        (entry) =>
          entry.startsWith("__Secure-better-auth.session_token=") &&
          entry.includes("Max-Age=0") &&
          !entry.includes("Domain="),
      ),
    ).toBe(true);

    expect(
      cookies.some((entry) => entry.includes("Domain=solace.onl")),
    ).toBe(false);
  });

  it("is a no-op outside production or when hostname equals root domain", () => {
    const headers = new Headers();

    expireLegacyHostScopedAuthCookies(
      { headers },
      {
        backendUrl: "https://api.solace.onl",
        isProduction: false,
        cookieSameSite: "lax",
      },
    );

    expect(getSetCookies(headers)).toHaveLength(0);

    expireLegacyHostScopedAuthCookies(
      { headers },
      {
        backendUrl: "https://solace.onl",
        isProduction: true,
        cookieSameSite: "lax",
      },
    );

    expect(getSetCookies(headers)).toHaveLength(0);
  });
});
