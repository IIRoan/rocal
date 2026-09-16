import { Elysia } from "elysia";
import { BETTER_AUTH_BASE_PATH } from "./auth-constants";

const JSON_API_CSP = "default-src 'none'; frame-ancestors 'none'";
// Better Auth's `/error` page is the only HTML we serve; it uses an inline <style>.
const AUTH_ERROR_PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'";
const AUTH_ERROR_PAGE_PATH = `${BETTER_AUTH_BASE_PATH}/error`;
/**
 * The avatar proxy is loaded as a no-cors `<img>` subresource. `same-site`
 * would block it wherever the web origin is not same-site with the API — Vercel
 * preview deployments (*.vercel.app) and any future split domain — so this one
 * route opts into `cross-origin`. It streams a profile picture the client
 * already asked for by address and carries no other data.
 */
const AVATAR_PATH_SUFFIX = "/profiles/avatar";

/**
 * Headers applied to every API response.
 *
 * CORP is `same-site`: web (app.*) and API (api.*) share a registrable domain,
 * and native fetches are not subject to CORP. It only blocks other sites from
 * embedding API responses as no-cors resources.
 */
export function buildSecurityHeaders(input: {
  isProduction: boolean;
  pathname: string;
}): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy":
      input.pathname === AUTH_ERROR_PAGE_PATH ? AUTH_ERROR_PAGE_CSP : JSON_API_CSP,
    "Cross-Origin-Resource-Policy": input.pathname.endsWith(AVATAR_PATH_SUFFIX)
      ? "cross-origin"
      : "same-site",
    "Permissions-Policy":
      "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()",
    ...(input.isProduction
      ? {
          "Strict-Transport-Security":
            "max-age=63072000; includeSubDomains; preload",
        }
      : {}),
  };
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

export function createSecurityHeadersPlugin(isProduction: boolean) {
  return new Elysia({ name: "security-headers" }).request(({ request, set }) => {
    Object.assign(
      set.headers,
      buildSecurityHeaders({ isProduction, pathname: pathnameOf(request.url) }),
    );
  });
}
