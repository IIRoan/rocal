import { Elysia } from "elysia";
import type { IMailService, MailOAuthConfig } from "../contracts/mail.contract";
import { BETTER_AUTH_BASE_PATH } from "../lib/auth-constants";
import { createLogger } from "@workspace/logger";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { auth } from "../lib/auth";
import { MailService } from "../services/mail.service";
import { createStalwartAdminClient } from "../lib/stalwart-admin";
import {
  buildStalwartMailBridgeRedirectUri,
  getStalwartMailBridgeClientId,
} from "../lib/mail-bridge-auth";
import { errorMessage } from "../lib/errors";

type JmapProxyFetcher = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

const logger = createLogger("backend:mail-jmap-proxy");
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
  return Buffer.from(signature)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/**
 * Pre-computes the argon2id-derived vault decryption key for native clients.
 *
 * Native apps (Hermes JS engine) cannot run argon2id efficiently — the
 * pure-JS implementation blocks the main thread and may crash due to
 * memory pressure. The backend has WASM-backed hash-wasm and can compute
 * argon2id(keyMaterial, vaultSalt, kdfParams) server-side, returning the
 * 32-byte AES-GCM key as base64. The native app then uses this key directly.
 *
 * Returns null if the user has no vault backup yet.
 */
async function deriveVaultKeyForNative(
  userId: string,
  keyMaterial: string,
): Promise<string | null> {
  const entry = await prisma.mailDirectoryEntry.findUnique({
    where: { userId },
    select: {
      vaultBackup: {
        select: {
          kdfSaltB64: true,
          kdfMemoryKiB: true,
          kdfIterations: true,
          kdfParallelism: true,
        },
      },
    },
  });

  if (!entry?.vaultBackup) {
    logger.warn("[deriveVaultKeyForNative] no vault backup found for userId=%s", userId);
    return null;
  }

  const { kdfSaltB64, kdfMemoryKiB, kdfIterations, kdfParallelism } = entry.vaultBackup;
  logger.debug(
    "[deriveVaultKeyForNative] running argon2id: memoryKiB=%d iterations=%d parallelism=%d saltLen=%d",
    kdfMemoryKiB, kdfIterations, kdfParallelism, kdfSaltB64.length,
  );

  // kdfSaltB64 may be standard base64 or base64url — normalize to standard before decode.
  const saltBase64 = kdfSaltB64.replace(/-/g, "+").replace(/_/g, "/");

  const { argon2id } = await import("hash-wasm");
  const derived = await argon2id({
    password: keyMaterial,
    salt: Buffer.from(saltBase64, "base64"),
    memorySize: kdfMemoryKiB,
    iterations: kdfIterations,
    parallelism: kdfParallelism,
    hashLength: 32,
    outputType: "binary",
  });

  logger.debug("[deriveVaultKeyForNative] argon2id succeeded, returning derivedKeyB64");
  return Buffer.from(derived)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

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
    stalwartOauthClientId: getStalwartMailBridgeClientId(),
    stalwartOauthRedirectUri: buildStalwartMailBridgeRedirectUri(),
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
  const requestBody =
    method === "GET" || method === "HEAD"
      ? undefined
      : await input.request.arrayBuffer();

  let response: Response;
  try {
    response = await (input.fetcher ?? fetch)(upstreamUrl, {
      method,
      headers,
      body:
        requestBody && requestBody.byteLength > 0 ? requestBody : undefined,
      redirect: "follow",
    });
  } catch (err) {
    const message =
      errorMessage(err, "Unknown network error");
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
        const userId = session?.session?.userId;
        const email = session?.user?.email?.trim();
        if (!userId || !email) {
          set.status = 401;
          return {
            error: "Unauthorized",
            message: "A valid session is required to obtain a mail token.",
            statusCode: 401,
          };
        }

        try {
          return await mailService.issueAccessTokenForUser({
            userId,
            email,
          });
        } catch (err) {
          const message =
            errorMessage(err, "Could not issue mail token.");
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
          // Pre-compute the argon2id output for native clients (Hermes cannot run
          // argon2id efficiently). Returns null if no vault backup exists yet.
          let derivedKeyB64: string | null = null;
          try {
            derivedKeyB64 = await deriveVaultKeyForNative(session.session.userId, keyMaterial);
          } catch (derivedErr) {
            logger.error(
              "[vault-key-material] deriveVaultKeyForNative failed for userId=%s: %s",
              session.session.userId,
              derivedErr instanceof Error ? derivedErr.message : String(derivedErr),
            );
          }
          logger.debug(
            "[vault-key-material] responding hasDerivedKey=%s for userId=%s",
            derivedKeyB64 ? "yes" : "no",
            session.session.userId,
          );
          return { keyMaterial, derivedKeyB64, version: "v1" };
        } catch (err) {
          const message =
            errorMessage(err, "Could not derive vault key material.");
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
