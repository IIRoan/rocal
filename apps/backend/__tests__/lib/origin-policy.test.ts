import { describe, expect, it } from "@jest/globals";
import {
  buildMobileTrustedOriginVariants,
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
  it("trusts production and development-client Solace deep links by default", () => {
    const origins = getAuthTrustedOrigins();

    expect(DEFAULT_MOBILE_AUTH_CALLBACK_URLS).toEqual([
      "solace://api/auth",
      "solace-dev://api/auth",
      "app.solace.onl://api/auth",
    ]);
    expect(origins).toEqual(
      expect.arrayContaining([
        "solace://",
        "solace://api/auth",
        "solace-dev://",
        "solace-dev://api/auth",
      ]),
    );
  });
});
