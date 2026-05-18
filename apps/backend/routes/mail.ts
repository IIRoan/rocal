import { Elysia } from "elysia";
import type { IMailService, MailOAuthConfig } from "../contracts/mail.contract";
import { BETTER_AUTH_BASE_PATH } from "../lib/auth-constants";
import { createLogger } from "@workspace/logger";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { auth } from "../lib/auth";
import { MailService } from "../services/mail.service";
import { createStalwartAdminClient } from "../lib/stalwart-admin";

type JmapProxyFetcher = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createServerPkcePair(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
}> {
  const verifierBytes = new Uint8Array(32);
  crypto.getRandomValues(verifierBytes);
  const codeVerifier = base64UrlEncodeBytes(verifierBytes);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier),
  );
  return { codeVerifier, codeChallenge: base64UrlEncodeBytes(new Uint8Array(digest)) };
}

/** Audiences valid for mail access tokens (mirrors the logic in auth.ts). */
const mailTokenAudiences =
  env.mailOauthAudiences.length > 0
    ? env.mailOauthAudiences
    : [env.stalwartBaseUrl];

async function deriveVaultKeyMaterial(userId: string): Promise<string> {
  const hmacKey = env.mailVaultHmacKey;
  if (!hmacKey) {
    throw new Error(
      "MAIL_VAULT_HMAC_KEY is not configured on this server. Set it to a permanent random base64 secret.",
    );
  }
  const rawKey = Uint8Array.from(atob(hmacKey), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const message = new TextEncoder().encode(`${userId}:vault-key:v1`);
  const signature = await crypto.subtle.sign("HMAC", key, message);
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

/**
 * Server-side OAuth authorization code + token exchange using the loopback
 * backend address. Avoids the browser iframe flow by doing the full code
 * grant inside the backend itself, forwarding the caller's session cookie.
 */
async function exchangeSessionForMailOAuthToken(
  sessionCookie: string,
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  expires_at: number;
}> {
  const localAuthBase = `http://127.0.0.1:${env.port}${BETTER_AUTH_BASE_PATH}`;
  const clientId = env.mailOauthClientId;
  const clientSecret = env.mailOauthClientSecret;
  const redirectUri = env.mailOauthRedirectUris[0];

  if (!clientId || !redirectUri) {
    throw new Error("Mail OAuth is not configured on this server.");
  }

  const { codeVerifier, codeChallenge } = await createServerPkcePair();
  const state = crypto.randomUUID();

  const authorizeUrl = new URL(`${localAuthBase}/oauth2/authorize`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", env.mailOauthScopes.join(" "));
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("prompt", "none");
  for (const aud of mailTokenAudiences) {
    authorizeUrl.searchParams.append("resource", aud);
  }

  const authorizeResponse = await fetch(authorizeUrl.toString(), {
    redirect: "manual",
    headers: { Cookie: sessionCookie },
  });

  const location = authorizeResponse.headers.get("location");
  if (!location) {
    throw new Error(
      "The authorization server did not return a redirect. Check that your session is valid.",
    );
  }

  let callbackUrl: URL;
  try {
    callbackUrl = new URL(location);
  } catch {
    throw new Error("The authorization server returned an invalid redirect URL.");
  }

  const returnedState = callbackUrl.searchParams.get("state");
  if (returnedState !== state) {
    throw new Error("Invalid state parameter - possible CSRF attack.");
  }

  const authError = callbackUrl.searchParams.get("error");
  if (authError) {
    throw new Error(
      callbackUrl.searchParams.get("error_description") ??
        `Authorization failed: ${authError}`,
    );
  }

  const code = callbackUrl.searchParams.get("code");
  if (!code) {
    throw new Error(
      "The authorization server did not return an authorization code. You may not be signed in.",
    );
  }

  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code,
    code_verifier: codeVerifier,
  });
  if (clientSecret) {
    tokenBody.set("client_secret", clientSecret);
  }
  for (const aud of mailTokenAudiences) {
    tokenBody.append("resource", aud);
  }

  const tokenResponse = await fetch(`${localAuthBase}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody.toString(),
  });

  type TokenPayload = {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    expires_at?: number;
    error?: string;
    error_description?: string;
  };

  const tokenData = (await tokenResponse
    .json()
    .catch(() => null)) as TokenPayload | null;

  if (!tokenResponse.ok || !tokenData?.access_token) {
    throw new Error(
      tokenData?.error_description ??
        tokenData?.error ??
        "Token exchange failed.",
    );
  }

  const expiresIn = tokenData.expires_in ?? 3600;
  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_in: expiresIn,
    expires_at:
      tokenData.expires_at ?? Math.floor(Date.now() / 1000) + expiresIn,
  };
}

const logger = createLogger("backend:mail-jmap-proxy");

const publicJmapProxyBaseUrl = `${normalizeBaseUrl(env.backendUrl)}/api/mail/jmap`;

function summarizeBearerToken(
  authorization: string | null,
): Record<string, unknown> {
  if (!authorization?.startsWith("Bearer ")) {
    return { tokenType: authorization ? "non-bearer" : "missing" };
  }

  const token = authorization.slice("Bearer ".length).trim();
  const parts = token.split(".");
  if (parts.length < 2) {
    return {
      tokenType: "opaque",
      tokenLength: token.length,
    };
  }

  const decodePart = (input: string) => {
    try {
      const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(
        normalized.length + ((4 - (normalized.length % 4)) % 4),
        "=",
      );
      return JSON.parse(
        Buffer.from(padded, "base64").toString("utf8"),
      ) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const header = decodePart(parts[0]!);
  const payload = decodePart(parts[1]!);

  return {
    tokenType: "jwt",
    alg: header?.alg,
    kid: header?.kid,
    iss: payload?.iss,
    aud: payload?.aud,
    azp: payload?.azp,
    exp: payload?.exp,
  };
}

function summarizeUpstreamErrorBody(
  body: string | null,
): Record<string, unknown> {
  if (!body) {
    return { bodyPresent: false };
  }

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return {
      bodyPresent: true,
      bodyLength: body.length,
      error: parsed.error,
      type: parsed.type,
      title: parsed.title,
      status: parsed.status,
    };
  } catch {
    return {
      bodyPresent: true,
      bodyLength: body.length,
      bodyFormat: "non-json",
    };
  }
}

function buildMailOAuthConfig(): MailOAuthConfig {
  const authBaseUrl = `${normalizeBaseUrl(env.backendUrl)}${BETTER_AUTH_BASE_PATH}`;
  const audiences =
    env.mailOauthAudiences.length > 0
      ? env.mailOauthAudiences
      : [env.stalwartBaseUrl];

  return {
    issuer: authBaseUrl,
    discoveryUrl: `${authBaseUrl}/.well-known/openid-configuration`,
    authorizationEndpoint: `${authBaseUrl}/oauth2/authorize`,
    tokenEndpoint: `${authBaseUrl}/oauth2/token`,
    userinfoEndpoint: `${authBaseUrl}/oauth2/userinfo`,
    jwksUri: `${authBaseUrl}/jwks`,
    mailTokenEndpoint: `${normalizeBaseUrl(env.backendUrl)}/api/mail/oauth/access-token`,
    clientId: env.mailOauthBrowserClientId,
    redirectUri: env.mailOauthBrowserRedirectUris[0] || "",
    scopes: env.mailOauthScopes,
    audiences,
  };
}

export const defaultMailService = new MailService(
  prisma,
  createStalwartAdminClient(),
  {
    defaultDomain: env.stalwartDefaultDomain,
    discoveryBaseUrl: publicJmapProxyBaseUrl,
    oauth: buildMailOAuthConfig(),
    vaultKeyMaterialEndpoint: `${normalizeBaseUrl(env.backendUrl)}/api/mail/vault-key-material`,
  },
);

async function proxyJmapRequest(input: {
  request: Request;
  upstreamPath: string;
  upstreamBaseUrl: string;
  fetcher?: JmapProxyFetcher;
}): Promise<Response> {
  const authorization = input.request.headers.get("authorization");

  if (!authorization) {
    return Response.json(
      {
        error: "Unauthorized",
        message: "Mailbox authorization is required.",
        statusCode: 401,
        timestamp: new Date().toISOString(),
      },
      {
        status: 401,
      },
    );
  }

  const requestUrl = new URL(input.request.url);
  const upstreamUrl = `${normalizeBaseUrl(input.upstreamBaseUrl)}${input.upstreamPath}${requestUrl.search}`;
  const headers = new Headers({
    Authorization: authorization,
  });
  const accept = input.request.headers.get("accept");
  const contentType = input.request.headers.get("content-type");

  if (accept) {
    headers.set("Accept", accept);
  }

  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  const method = input.request.method.toUpperCase();

  let response: Response;
  try {
    response = await (input.fetcher ?? fetch)(upstreamUrl, {
      method,
      headers,
      body:
        method === "GET" || method === "HEAD"
          ? undefined
          : await input.request.text(),
      redirect: "follow",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown network error";
    logger.error("JMAP proxy upstream request failed", {
      upstreamUrl,
      method,
      token: summarizeBearerToken(authorization),
      message,
    });
    return Response.json(
      {
        error: "Mail server unreachable",
        message: `Could not connect to the mail server: ${message}`,
        statusCode: 503,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }

  const responseHeaders = new Headers();
  const responseContentType = response.headers.get("content-type");
  const cacheControl = response.headers.get("cache-control");

  if (responseContentType) {
    responseHeaders.set("Content-Type", responseContentType);
  }

  if (cacheControl) {
    responseHeaders.set("Cache-Control", cacheControl);
  }

  if (!response.ok) {
    let upstreamBody: string | null = null;
    try {
      upstreamBody = await response.clone().text();
    } catch {
      upstreamBody = null;
    }

    logger.warn("JMAP proxy upstream responded with an error", {
      upstreamUrl,
      method,
      status: response.status,
      token: summarizeBearerToken(authorization),
      upstreamError: summarizeUpstreamErrorBody(upstreamBody),
    });
  }

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}

export function createMailRoutes(
  mailService: IMailService = defaultMailService,
  options: {
    jmapFetch?: JmapProxyFetcher;
    jmapUpstreamBaseUrl?: string;
  } = {},
) {
  const jmapFetch = options.jmapFetch ?? fetch;
  const jmapUpstreamBaseUrl =
    options.jmapUpstreamBaseUrl ?? env.stalwartBaseUrl;

  return new Elysia({
    prefix: "/mail",
    normalize: false,
  })
    .get("/config", () => mailService.getConfig(), {
      detail: {
        tags: ["Mail"],
        summary: "Get public mail-demo configuration",
        description:
          "Returns the public mailbox domain and Stalwart discovery base used by the mail demo.",
      },
    })
    .get(
      "/oauth/access-token",
      async ({ request, set }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.session) {
          set.status = 401;
          return {
            error: "Unauthorized",
            message: "A valid session is required to obtain a mail token.",
            statusCode: 401,
          };
        }

        const cookieHeader = request.headers.get("cookie") ?? "";
        try {
          return await exchangeSessionForMailOAuthToken(cookieHeader);
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Could not issue mail token.";
          set.status = 400;
          return {
            error: "mail_token_error",
            message,
            statusCode: 400,
          };
        }
      },
      {
        detail: {
          tags: ["Mail"],
          summary: "Exchange session for a mail OAuth access token",
          description:
            "Performs a server-side OAuth authorization code flow using the caller's session cookie and returns a JWT access token accepted by the mail server.",
        },
      },
    )
    .get(
      "/vault-key-material",
      async ({ request, set }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.session?.userId) {
          set.status = 401;
          return {
            error: "Unauthorized",
            message: "A valid session is required to obtain vault key material.",
            statusCode: 401,
          };
        }
        try {
          const keyMaterial = await deriveVaultKeyMaterial(session.session.userId);
          return { keyMaterial, version: "v1" };
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Could not derive vault key material.";
          set.status = 500;
          return { error: "vault_key_error", message, statusCode: 500 };
        }
      },
      {
        detail: {
          tags: ["Mail"],
          summary: "Get server-derived vault key material",
          description:
            "Returns an HMAC-SHA256 derived key material unique to the authenticated user. Used client-side to derive the vault encryption key without a user-typed password.",
        },
      },
    )
    .get(
      "/keys/:email",
      async ({ params }) => mailService.getDirectoryKey(params.email),
      {
        detail: {
          tags: ["Mail"],
          summary: "Look up an internal recipient public key",
          description:
            "Returns the stored OpenPGP public key directory entry for an internal mailbox.",
        },
      },
    )
    .all(
      "/jmap/.well-known/jmap",
      ({ request }) =>
        proxyJmapRequest({
          request,
          upstreamPath: "/.well-known/jmap",
          upstreamBaseUrl: jmapUpstreamBaseUrl,
          fetcher: jmapFetch,
        }),
      {
        detail: {
          tags: ["Mail"],
          summary: "Proxy JMAP discovery for the mail demo",
          description:
            "Forwards JMAP discovery to the configured Stalwart instance so browser clients can operate without direct cross-origin access.",
        },
      },
    )
    .all(
      "/jmap/jmap",
      ({ request }) =>
        proxyJmapRequest({
          request,
          upstreamPath: "/jmap/",
          upstreamBaseUrl: jmapUpstreamBaseUrl,
          fetcher: jmapFetch,
        }),
      {
        detail: {
          tags: ["Mail"],
          summary: "Proxy root JMAP calls for the mail demo",
          description:
            "Forwards authenticated JMAP calls to Stalwart while keeping private-key operations in the browser.",
        },
      },
    )
    .all(
      "/jmap/jmap/",
      ({ request }) =>
        proxyJmapRequest({
          request,
          upstreamPath: "/jmap/",
          upstreamBaseUrl: jmapUpstreamBaseUrl,
          fetcher: jmapFetch,
        }),
      {
        detail: {
          tags: ["Mail"],
          summary: "Proxy root JMAP calls for the mail demo",
          description:
            "Forwards authenticated JMAP calls to Stalwart while keeping private-key operations in the browser.",
        },
      },
    )
    .all(
      "/jmap/jmap/*",
      ({ params, request }) =>
        proxyJmapRequest({
          request,
          upstreamPath: `/jmap/${params["*"]}`,
          upstreamBaseUrl: jmapUpstreamBaseUrl,
          fetcher: jmapFetch,
        }),
      {
        detail: {
          tags: ["Mail"],
          summary: "Proxy nested JMAP resources for the mail demo",
          description:
            "Forwards nested JMAP download, upload, and event-source requests to Stalwart through the backend proxy.",
        },
      },
    );
}

export const mailRoutes = createMailRoutes();
