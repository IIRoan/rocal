import { Elysia } from "elysia";
import { BETTER_AUTH_BASE_PATH } from "./auth-constants";

const JSON_API_CSP = "default-src 'none'; frame-ancestors 'none'";
// Better Auth's `/error` page is the only HTML we serve; it uses an inline <style>.
const AUTH_ERROR_PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'";
const AUTH_ERROR_PAGE_PATH = `${BETTER_AUTH_BASE_PATH}/error`;

/**
 * Headers applied to every API response.
 *
 * CORP is `same-site`: web (app.*) and API (api.*) share a registrable domain,
 * and native fetches are not subject to CORP. It only blocks other sites from
 * embedding API responses (e.g. authenticated avatar images) as no-cors resources.
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
    "Cross-Origin-Resource-Policy": "same-site",
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
