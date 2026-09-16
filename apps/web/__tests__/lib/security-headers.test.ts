import { describe, expect, it } from "@jest/globals";

import {
  buildContentSecurityPolicy,
  buildSecurityHeaderRoutes,
  PERMISSIONS_POLICY,
} from "../../lib/security-headers";

const PRODUCTION_ENV = {
  NODE_ENV: "production",
  NEXT_PUBLIC_API_URL: "https://api.solace.onl/",
  NEXT_PUBLIC_APP_URL: "https://app.solace.onl",
  NEXT_PUBLIC_SENTRY_DSN: "https://publickey@errex.solace.onl/solace",
};

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(";").map((part) => {
      const [name = "", ...sources] = part.trim().split(/\s+/);
      return [name, sources];
    }),
  );
}

function headerMap(headers: Array<{ key: string; value: string }>) {
  return Object.fromEntries(headers.map((header) => [header.key, header.value]));
}

describe("buildContentSecurityPolicy", () => {
  it("derives connect/frame/form hosts from env without leaking DSN credentials", () => {
    const policy = buildContentSecurityPolicy(PRODUCTION_ENV);
    const csp = directives(policy);

    expect(csp.get("connect-src")).toEqual([
      "'self'",
      "https://api.solace.onl",
      "https://errex.solace.onl",
      "blob:",
      "data:",
    ]);
    expect(csp.get("frame-src")).toEqual(["'self'", "https://api.solace.onl", "https://app.solace.onl"]);
    expect(csp.get("form-action")).toEqual(["'self'", "https://api.solace.onl"]);
    expect(policy).not.toContain("publickey@");
  });

  it("is strict about framing, plugins, base and scripts in production", () => {
    const csp = directives(buildContentSecurityPolicy(PRODUCTION_ENV));

    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'self'"]);
    expect(csp.get("default-src")).toEqual(["'self'"]);
    expect(csp.get("script-src")).toEqual(["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"]);
    expect(csp.get("worker-src")).toEqual(["'self'", "blob:"]);
    expect(csp.get("img-src")).toEqual(["'self'", "data:", "blob:", "https:"]);
    expect(csp.has("upgrade-insecure-requests")).toBe(true);
  });

  it("only relaxes eval and connect sources in development", () => {
    const csp = directives(
      buildContentSecurityPolicy({ NODE_ENV: "development", NEXT_PUBLIC_API_URL: "http://localhost:4001" }),
    );

    expect(csp.get("script-src")).toContain("'unsafe-eval'");
    expect(csp.get("connect-src")).toEqual(
      expect.arrayContaining(["http://localhost:4001", "ws:", "wss:"]),
    );
    expect(csp.has("upgrade-insecure-requests")).toBe(false);
  });

  it("ignores missing or non-http env values", () => {
    const csp = directives(
      buildContentSecurityPolicy({ NODE_ENV: "production", NEXT_PUBLIC_API_URL: "javascript:alert(1)" }),
    );

    expect(csp.get("connect-src")).toEqual(["'self'", "blob:", "data:"]);
    expect(csp.get("frame-src")).toEqual(["'self'"]);
  });
});

describe("buildSecurityHeaderRoutes", () => {
  it("applies the full header set to every path", () => {
    const [allRoutes] = buildSecurityHeaderRoutes(PRODUCTION_ENV);
    const headers = headerMap(allRoutes?.headers ?? []);

    expect(allRoutes?.source).toBe("/:path*");
    expect(headers).toMatchObject({
      "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Permissions-Policy": PERMISSIONS_POLICY,
    });
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });

  it("keeps passkeys enabled while disabling device features", () => {
    expect(PERMISSIONS_POLICY).toContain("publickey-credentials-get=(self)");
    expect(PERMISSIONS_POLICY).toContain("publickey-credentials-create=(self)");
    for (const feature of ["camera", "microphone", "geolocation", "payment", "usb"]) {
      expect(PERMISSIONS_POLICY).toContain(`${feature}=()`);
    }
  });

  it("never allows the app to be framed", () => {
    const routes = buildSecurityHeaderRoutes(PRODUCTION_ENV);
    const headers = headerMap(routes.at(-1)?.headers ?? []);

    expect(routes).toHaveLength(1);
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });
});
