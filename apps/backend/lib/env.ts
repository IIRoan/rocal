/**
 * Centralized environment configuration for the backend.
 *
 * All URL and port values are read from environment variables.
 * Fallbacks exist only as a safety net for local development when
 * `.env` is missing — they should never be relied upon in production.
 */

const DEV_BACKEND_URL = "http://localhost:4001";
const DEV_FRONTEND_URL = "http://localhost:4000";
const DEFAULT_STALWART_BASE_URL = "https://mail.solace.onl";

export const env = {
  /** The port the backend listens on. */
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 4001,

  /** Full backend base URL (e.g. https://api.example.com). */
  backendUrl: process.env.BACKEND_URL || DEV_BACKEND_URL,

  /** Full frontend base URL (e.g. https://app.example.com). */
  frontendUrl:
    process.env.FRONTEND_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    DEV_FRONTEND_URL,

  /** Whether the app is running in production mode. */
  isProduction: process.env.NODE_ENV === "production",

  /** Cookie sameSite policy for auth cookies. */
  cookieSameSite: (process.env.AUTH_COOKIE_SAME_SITE || "lax") as
    | "lax"
    | "strict"
    | "none",

  /** Mobile deep-link callback URL for OAuth flows. */
  mobileAuthCallbackUrl:
    process.env.MOBILE_AUTH_CALLBACK_URL ||
    process.env.NEXT_PUBLIC_MOBILE_AUTH_CALLBACK_URL ||
    "solace://api/auth",

  /** HTTPS origin for Stalwart JMAP/admin access. */
  stalwartBaseUrl: process.env.STALWART_BASE_URL || DEFAULT_STALWART_BASE_URL,

  /** Default email domain used by the mail demo when provisioning new mailboxes. */
  stalwartDefaultDomain: process.env.STALWART_DEFAULT_DOMAIN || "solace.onl",

  /** Admin token used for Stalwart provisioning via JMAP registry methods. */
  stalwartAdminToken: process.env.STALWART_ADMIN_TOKEN || "",
} as const;

/** Parse a comma-separated env var into a trimmed string array. */
export const parseCsvEnv = (value?: string): string[] => {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

/** Extract the origin from a URL string, returning the input on failure. */
export const toOrigin = (url: string): string => {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
};
