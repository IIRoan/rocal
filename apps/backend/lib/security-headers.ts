import { Elysia } from "elysia";
import { BETTER_AUTH_BASE_PATH } from "./auth-constants";

const JSON_API_CSP = "default-src 'none'; frame-ancestors 'none'";
// Better Auth's `/error` page is the only HTML we serve; it uses an inline <style>.
const AUTH_ERROR_PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'";
const AUTH_ERROR_PAGE_PATH = `${BETTER_AUTH_BASE_PATH}/error`;
/** Loaded as a no-cors `<img>`, which `same-site` would block on *.vercel.app previews. */
const AVATAR_PATH_SUFFIX = "/profiles/avatar";

/** CORP can be `same-site` because web and API share a registrable domain and native ignores CORP. */
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
