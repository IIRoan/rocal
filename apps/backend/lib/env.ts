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
const DEFAULT_MAIL_OAUTH_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
];

function buildDefaultMailOauthBrowserRedirectUris(
  frontendUrl: string,
): string[] {
  try {
    return [
      new URL(
        "/mail/oauth/callback",
        frontendUrl.replace(/\/+$/, "") + "/",
      ).toString(),
    ];
  } catch {
    return [];
  }
}

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

type MailOauthConfigurationInput = {
  clientId: string;
  redirectUris: string[];
  browserClientId: string;
  browserRedirectUris: string[];
};

export function getMailOauthConfigurationErrors(
  input: MailOauthConfigurationInput,
): string[] {
  const errors: string[] = [];

  if (!input.clientId) {
    errors.push("MAIL_OAUTH_CLIENT_ID must be configured for mail OAuth.");
  }

  if (input.redirectUris.length === 0) {
    errors.push(
      "MAIL_OAUTH_REDIRECT_URIS must contain at least one absolute URL.",
    );
  }

  if (!input.browserClientId) {
    errors.push(
      "MAIL_OAUTH_BROWSER_CLIENT_ID must be configured for browser mail OAuth.",
    );
  }

  if (input.browserRedirectUris.length === 0) {
    errors.push(
      "MAIL_OAUTH_BROWSER_REDIRECT_URIS must contain at least one absolute URL.",
    );
  }

  return errors;
}

export function resolveMailOauthEnabled(
  input: MailOauthConfigurationInput & { enabled?: string },
): boolean {
  const explicitValue = parseBooleanEnv(input.enabled);

  if (explicitValue !== undefined) {
    return explicitValue;
  }

  return getMailOauthConfigurationErrors(input).length === 0;
}

const resolvedFrontendUrl =
  process.env.FRONTEND_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  DEV_FRONTEND_URL;
const resolvedMailOauthClientId =
  process.env.MAIL_OAUTH_CLIENT_ID?.trim() || "";
const resolvedMailOauthClientName =
  process.env.MAIL_OAUTH_CLIENT_NAME?.trim() || "Solace Mail";
const defaultMailOauthBrowserClientId = resolvedMailOauthClientId
  ? `${resolvedMailOauthClientId}-browser`
  : "";
const defaultMailOauthBrowserClientName = `${resolvedMailOauthClientName} Web`;
const defaultMailOauthBrowserRedirectUris =
  buildDefaultMailOauthBrowserRedirectUris(resolvedFrontendUrl);
const resolvedMailOauthRedirectUris = parseCsvEnv(
  process.env.MAIL_OAUTH_REDIRECT_URIS,
);
const resolvedMailOauthBrowserClientId =
  process.env.MAIL_OAUTH_BROWSER_CLIENT_ID?.trim() ||
  defaultMailOauthBrowserClientId;
const resolvedMailOauthBrowserRedirectUris = parseCsvEnvWithDefault(
  process.env.MAIL_OAUTH_BROWSER_REDIRECT_URIS,
  defaultMailOauthBrowserRedirectUris,
);
const resolvedMailOauthEnabled = resolveMailOauthEnabled({
  enabled: process.env.MAIL_OAUTH_ENABLED,
  clientId: resolvedMailOauthClientId,
  redirectUris: resolvedMailOauthRedirectUris,
  browserClientId: resolvedMailOauthBrowserClientId,
  browserRedirectUris: resolvedMailOauthBrowserRedirectUris,
});

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

  /** OAuth client id used for hidden mail OAuth flows. */
  mailOauthClientId: resolvedMailOauthClientId,

  /** Whether backend mail OAuth routes and startup seeding should be active. */
  mailOauthEnabled: resolvedMailOauthEnabled,

  /** OAuth client secret used for confidential mail OAuth clients. */
  mailOauthClientSecret: process.env.MAIL_OAUTH_CLIENT_SECRET?.trim() || "",

  /** Friendly name for the seeded mail OAuth client. */
  mailOauthClientName: resolvedMailOauthClientName,

  /** Redirect URIs allowed for the seeded mail OAuth client. */
  mailOauthRedirectUris: resolvedMailOauthRedirectUris,

  /** Public browser client id used for first-party silent mail OAuth. */
  mailOauthBrowserClientId: resolvedMailOauthBrowserClientId,

  /** Friendly name for the seeded browser mail OAuth client. */
  mailOauthBrowserClientName:
    process.env.MAIL_OAUTH_BROWSER_CLIENT_NAME?.trim() ||
    defaultMailOauthBrowserClientName,

  /** Redirect URIs allowed for the first-party browser mail OAuth client. */
  mailOauthBrowserRedirectUris: resolvedMailOauthBrowserRedirectUris,

  /** Optional post-logout redirect URIs for the seeded mail OAuth client. */
  mailOauthPostLogoutRedirectUris: parseCsvEnv(
    process.env.MAIL_OAUTH_POST_LOGOUT_REDIRECT_URIS,
  ),

  /** Scopes advertised and minted for mail OAuth. */
  mailOauthScopes: parseCsvEnvWithDefault(
    process.env.MAIL_OAUTH_SCOPES,
    DEFAULT_MAIL_OAUTH_SCOPES,
  ),

  /** Audience values accepted by the OAuth provider for mail access tokens. */
  mailOauthAudiences: parseCsvEnv(process.env.MAIL_OAUTH_AUDIENCES),

  /** Trusted client ids that should be cached and treated as managed. */
  mailOauthCachedTrustedClientIds: parseCsvEnv(
    process.env.MAIL_OAUTH_CACHED_TRUSTED_CLIENT_IDS ||
      process.env.MAIL_OAUTH_CLIENT_ID,
  ),

  /** Optional frontend login page override for OAuth redirects. */
  mailOauthLoginPage: process.env.MAIL_OAUTH_LOGIN_PAGE?.trim() || "",

  /** Optional frontend consent page override for OAuth redirects. */
  mailOauthConsentPage: process.env.MAIL_OAUTH_CONSENT_PAGE?.trim() || "",

  /** Optional pairwise subject secret for OIDC clients that request pairwise subjects. */
  mailOauthPairwiseSecret: process.env.MAIL_OAUTH_PAIRWISE_SECRET?.trim() || "",

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
