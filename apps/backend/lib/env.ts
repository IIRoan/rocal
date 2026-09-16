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

/** Parse a comma-separated env var into a trimmed string array. */
export function parseCsvEnv(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseCsvEnvWithDefault(value: string | undefined, fallback: string[]) {
  const parsed = parseCsvEnv(value);
  return parsed.length > 0 ? parsed : fallback;
}

export function parseBooleanEnv(value?: string): boolean | undefined {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return undefined;
  }

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
}
export const BETTER_AUTH_SECRET_MIN_LENGTH = 32;
const DEV_BETTER_AUTH_SECRET = "default-dev-secret-change-in-production";

/** Deployed environments (including Vercel previews) must never fall back to development secrets. */
export function isDeployedEnvironment(
  input: { nodeEnv?: string; vercelEnv?: string } = {
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
  },
): boolean {
  return (
    input.nodeEnv === "production" ||
    input.vercelEnv === "production" ||
    input.vercelEnv === "preview"
  );
}

/** Fail fast on a missing/weak BETTER_AUTH_SECRET outside local/test. */
export function resolveBetterAuthSecret(input: {
  secret?: string;
  deployed: boolean;
}): string {
  // The raw value is returned even when padded: changing it would invalidate sessions and JWKS.
  const secret = input.secret ?? "";
  if (secret.trim().length >= BETTER_AUTH_SECRET_MIN_LENGTH) {
    return secret;
  }

  if (input.deployed) {
    throw new Error(
      `BETTER_AUTH_SECRET must be set to at least ${BETTER_AUTH_SECRET_MIN_LENGTH} characters in production.`,
    );
  }

  return secret.trim() ? secret : DEV_BETTER_AUTH_SECRET;
}

const resolvedFrontendUrl =
  process.env.FRONTEND_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  DEV_FRONTEND_URL;

export const env = {
  /** The port the backend listens on. */
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 4001,

  /** Full backend base URL (e.g. https://api.example.com). */
  backendUrl: process.env.BACKEND_URL || DEV_BACKEND_URL,

  /** Full frontend base URL (e.g. https://app.example.com). */
  frontendUrl: resolvedFrontendUrl,

  /** Whether the app is running in production mode. */
  isProduction: process.env.NODE_ENV === "production",

  /** Cookie sameSite policy for auth cookies. */
  cookieSameSite: (process.env.AUTH_COOKIE_SAME_SITE || "lax") as
    | "lax"
    | "strict"
    | "none",

  /** Mobile deep-link callback URL for OAuth flows (production `solace://` scheme). */
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

  /** Shared secret used to verify Stalwart telemetry webhook signatures. */
  stalwartWebhookSecret: process.env.STALWART_WEBHOOK_SECRET?.trim() || "",

  /** Optional override for the Stalwart mail-ingest webhook callback URL. */
  stalwartWebhookUrl:
    process.env.STALWART_WEBHOOK_URL?.trim() ||
    `${process.env.BACKEND_URL || DEV_BACKEND_URL}/api/internal/stalwart/webhook`,

  /**
   * 256-bit base64-encoded HMAC master key used to derive per-user vault key
   * material server-side.  Treat as a permanent secret — rotating it makes all
   * existing vaults unreadable without a password-based re-encryption.
   */
  mailVaultHmacKey: process.env.MAIL_VAULT_HMAC_KEY?.trim() || "",
} as const;

/** Extract the origin from a URL string, returning the input on failure. */
export const toOrigin = (url: string): string => {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
};
