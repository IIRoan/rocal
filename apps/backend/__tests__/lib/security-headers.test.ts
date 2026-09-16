import { describe, expect, it } from "@jest/globals";
import { Elysia } from "elysia";
import {
  buildSecurityHeaders,
  createSecurityHeadersPlugin,
} from "../../lib/security-headers";

function createApp(isProduction: boolean) {
  return new Elysia({ prefix: "/api" })
    .use(createSecurityHeadersPlugin(isProduction))
    .get("/json", () => ({ ok: true }))
    .get("/raw", () => new Response("raw", { headers: { "content-type": "text/plain" } }))
    .all("/auth/*", () => new Response("<html></html>", { headers: { "content-type": "text/html" } }))
    .get("/boom", () => {
      throw new Error("boom");
    });
}

describe("security headers", () => {
  it("adds hardening headers to JSON, raw Response and error responses", async () => {
    const app = createApp(true);

    for (const path of ["/api/json", "/api/raw", "/api/boom"]) {
      const response = await app.handle(new Request(`https://api.solace.onl${path}`));
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("content-security-policy")).toBe(
        "default-src 'none'; frame-ancestors 'none'",
      );
      expect(response.headers.get("cross-origin-resource-policy")).toBe("same-site");
      expect(response.headers.get("permissions-policy")).toContain("camera=()");
      expect(response.headers.get("strict-transport-security")).toBe(
        "max-age=63072000; includeSubDomains; preload",
      );
    }
  });

  it("allows inline styles only on the Better Auth error page", async () => {
    const response = await createApp(true).handle(
      new Request("https://api.solace.onl/api/auth/error"),
    );
    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    );
  });

  it("lets the avatar proxy load cross-origin as an <img>", () => {
    // Previews serve web from *.vercel.app, so same-site would block avatars there.
    expect(
      buildSecurityHeaders({ isProduction: true, pathname: "/api/profiles/avatar" })[
        "Cross-Origin-Resource-Policy"
      ],
    ).toBe("cross-origin");
    expect(
      buildSecurityHeaders({ isProduction: true, pathname: "/api/events" })[
        "Cross-Origin-Resource-Policy"
      ],
    ).toBe("same-site");
  });

  it("omits HSTS outside production", () => {
    expect(
      buildSecurityHeaders({ isProduction: false, pathname: "/api/json" }),
    ).not.toHaveProperty("Strict-Transport-Security");
  });
});
