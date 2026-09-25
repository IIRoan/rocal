import { afterEach, describe, expect, it, jest } from "@jest/globals";
import {
  buildMobileTrustedOriginVariants,
  buildStaticTrustedOrigins,
  DEFAULT_MOBILE_AUTH_CALLBACK_URLS,
  getAuthTrustedOrigins,
} from "../../lib/origin-policy";

describe("buildMobileTrustedOriginVariants", () => {
  it("expands a solace-dev callback into root and path prefixes", () => {
    expect(buildMobileTrustedOriginVariants("solace-dev://api/auth")).toEqual(
      expect.arrayContaining([
        "solace-dev://",
        "solace-dev://api",
        "solace-dev://api/auth",
      ]),
    );
  });

  it("returns an empty list for missing values", () => {
    expect(buildMobileTrustedOriginVariants(null)).toEqual([]);
    expect(buildMobileTrustedOriginVariants("  ")).toEqual([]);
  });
});

describe("getAuthTrustedOrigins", () => {
  it("trusts production and development-client deep links for both apps by default", () => {
    const origins = getAuthTrustedOrigins();

    expect(DEFAULT_MOBILE_AUTH_CALLBACK_URLS).toEqual([
      "solace://api/auth",
      "solace-dev://api/auth",
      "solace-mail://api/auth",
      "solace-mail-dev://api/auth",
      "app.solace.onl://api/auth",
    ]);
    expect(origins).toEqual(
      expect.arrayContaining([
        "solace://",
        "solace://api/auth",
        "solace-dev://",
        "solace-dev://api/auth",
        "solace-mail://",
        "solace-mail-dev://api/auth",
      ]),
    );
  });
});

describe("localhost trust", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("only includes localhost outside production", () => {
    expect(buildStaticTrustedOrigins(false, [])).toEqual([
      "http://localhost",
      "https://localhost",
    ]);
    expect(buildStaticTrustedOrigins(true, ["https://app.solace.onl"])).toEqual([
      "https://app.solace.onl",
    ]);
  });

  it("rejects localhost origins in production but keeps mobile deep links", () => {
    process.env.NODE_ENV = "production";
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const policy = require("../../lib/origin-policy") as typeof import("../../lib/origin-policy");
      const localRequest = new Request("https://api.solace.onl/api/auth/get-session", {
        headers: { origin: "http://localhost" },
      });

      expect(
        policy.corsOriginPolicy.isOriginAllowed("http://localhost", localRequest),
      ).toBe(false);
      expect(
        policy.corsOriginPolicy.isOriginAllowed("https://localhost", localRequest),
      ).toBe(false);
      const origins = policy.getAuthTrustedOrigins(localRequest);
      expect(origins).not.toContain("http://localhost");
      expect(origins).toEqual(expect.arrayContaining(["solace://", "solace://api/auth"]));
    });
  });
});
