/** No nonces: static Cache Components shells cannot carry one and App Router streams RSC inline. */

export type SecurityHeaderEnv = {
  NODE_ENV?: string;
  NEXT_PUBLIC_API_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
  NEXT_PUBLIC_SENTRY_DSN?: string;
  SENTRY_DSN?: string;
};

type Header = { key: string; value: string };

/** Silent mail OAuth renders this page inside a same-origin hidden iframe. */
export const MAIL_OAUTH_CALLBACK_PATH = "/mail/oauth/callback";

function toOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

function unique(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export function buildContentSecurityPolicy(
  env: SecurityHeaderEnv,
  options: { allowSameOriginFraming?: boolean } = {},
): string {
  const isDev = env.NODE_ENV === "development";
  const apiOrigin = toOrigin(env.NEXT_PUBLIC_API_URL);
  const appOrigin = toOrigin(env.NEXT_PUBLIC_APP_URL);
  // Errex tunnel host (see lib/sentry-options.ts); the DSN username is not part of the origin.
  const errexOrigins = [toOrigin(env.NEXT_PUBLIC_SENTRY_DSN), toOrigin(env.SENTRY_DSN)];

  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    [
      "script-src",
      // wasm-unsafe-eval: hash-wasm (argon2id vault KDF). unsafe-eval only for React dev tooling.
      ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", ...(isDev ? ["'unsafe-eval'"] : [])],
    ],
    // Inline styles come from React, next/font, and mail HTML in the srcdoc reader frame.
    ["style-src", ["'self'", "'unsafe-inline'"]],
    // https: covers avatar URLs and opted-in mail images; the reader frame's CSP still blocks them.
    ["img-src", ["'self'", "data:", "blob:", "https:"]],
    ["font-src", ["'self'", "data:"]],
    [
      "connect-src",
      unique([
        "'self'",
        apiOrigin,
        ...errexOrigins,
        "blob:",
        "data:",
        // Dev: HMR websocket and the loopback API remapped to LAN hosts (lib/api-url.ts).
        ...(isDev ? ["ws:", "wss:", "http:", "https:"] : []),
      ]),
    ],
    ["media-src", ["'self'", "blob:", "data:"]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    // Silent mail OAuth iframe: API authorize endpoint redirecting back to the app.
    ["frame-src", unique(["'self'", apiOrigin, appOrigin])],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", unique(["'self'", apiOrigin])],
    ["frame-ancestors", [options.allowSameOriginFraming ? "'self'" : "'none'"]],
  ];

  const policy = directives.map(([name, sources]) => `${name} ${sources.join(" ")}`);
  if (!isDev) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

export const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "autoplay=()",
  "bluetooth=()",
  "browsing-topics=()",
  "camera=()",
  "display-capture=()",
  "geolocation=()",
  "gyroscope=()",
  "hid=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "serial=()",
  "usb=()",
  "xr-spatial-tracking=()",
  // Passkeys (Better Auth WebAuthn) must keep working on our own origin.
  "publickey-credentials-create=(self)",
  "publickey-credentials-get=(self)",
].join(", ");

function buildBaseHeaders(env: SecurityHeaderEnv): Header[] {
  return [
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(env) },
  ];
}

/** Entries for `headers()` in next.config.ts. Later entries override earlier keys. */
export function buildSecurityHeaderRoutes(env: SecurityHeaderEnv) {
  return [
    { source: "/:path*", headers: buildBaseHeaders(env) },
    {
      source: MAIL_OAUTH_CALLBACK_PATH,
      headers: [
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        {
          key: "Content-Security-Policy",
          value: buildContentSecurityPolicy(env, { allowSameOriginFraming: true }),
        },
      ],
    },
  ];
}
