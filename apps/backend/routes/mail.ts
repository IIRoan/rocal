import { Elysia } from "elysia";
import type { IMailService, MailOAuthConfig } from "../contracts/mail.contract";
import { BETTER_AUTH_BASE_PATH } from "../lib/auth-constants";
import { createLogger } from "@workspace/logger";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { requireAuth } from "../lib/auth-guard";
import {
  createApiErrorBody,
  unauthorizedBody,
} from "../lib/api-error-response";
import { hasUserId, type AuthenticatedUser } from "../lib/auth-utils";
import { auth } from "../lib/auth";
import { authenticatedRouteDetail } from "../lib/openapi";
import { MailService } from "../services/mail.service";
import { createStalwartAdminClient } from "../lib/stalwart-admin";
import {
  buildStalwartMailBridgeRedirectUri,
  getStalwartMailBridgeClientId,
} from "../lib/mail-bridge-auth";
import { errorMessage } from "../lib/errors";
import { logRef, redactPII, sanitizeRequestUrl, errorLogDetails } from "../lib/log-sanitization";

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

function classifyJmapProxyOperation(upstreamPath: string): string {
  if (upstreamPath.includes("/upload/")) return "blob-upload";
  if (upstreamPath.includes("/download/")) return "blob-download";
  if (upstreamPath === "/.well-known/jmap") return "discovery";
  if (upstreamPath.startsWith("/jmap/")) return "jmap-api";
  return "other";
}

function summarizeJmapRequestBody(
  requestBody: ArrayBuffer | undefined,
): Record<string, unknown> {
  if (!requestBody || requestBody.byteLength === 0) {
    return { bodyPresent: false };
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(requestBody).toString("utf8"),
    ) as {
      methodCalls?: unknown[];
      using?: string[];
    };
    const methodCalls = (parsed.methodCalls ?? [])
      .map((call) => (Array.isArray(call) ? call[0] : null))
      .filter((method): method is string => typeof method === "string");

    return {
      bodyPresent: true,
      bodyLength: requestBody.byteLength,
      using: parsed.using,
      methodCalls,
    };
  } catch {
    return {
      bodyPresent: true,
      bodyLength: requestBody.byteLength,
      bodyFormat: "non-json",
    };
  }
}

function requestIncludesSendIntent(
  requestSummary: Record<string, unknown>,
): boolean {
  const methodCalls = requestSummary.methodCalls;
  if (!Array.isArray(methodCalls)) {
    return false;
  }

  return methodCalls.some(
    (method) => method === "Email/set" || method === "EmailSubmission/set",
  );
}

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
  const exp = typeof payload?.exp === "number" ? payload.exp : null;
  const nowSec = Math.floor(Date.now() / 1000);

  return {
    tokenType: "jwt",
    alg: header?.alg,
    kid: header?.kid,
    iss: payload?.iss,
    aud: payload?.aud,
    azp: payload?.azp,
    sub:
      typeof payload?.sub === "string" && payload.sub.includes("@")
        ? logRef(payload.sub)
        : payload?.sub,
    exp,
    secondsUntilExpiry: exp !== null ? exp - nowSec : undefined,
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
      message:
        typeof parsed.message === "string"
          ? redactPII(parsed.message)
          : parsed.message,
      detail:
        typeof parsed.detail === "string"
          ? redactPII(parsed.detail)
          : parsed.detail,
      type: parsed.type,
      title:
        typeof parsed.title === "string"
          ? redactPII(parsed.title)
          : parsed.title,
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

async function resolveSessionUserForProxy(
  request: Request,
): Promise<AuthenticatedUser | null> {
  try {
    const session = await auth.api.getSession({
      headers: request.headers as Headers,
    });

    if (hasUserId(session?.user) && typeof session.user.id === "string") {
      const email = session.user.email?.trim();
      if (email) {
        return session.user;
      }
    }
  } catch (err) {
    logger.debug("JMAP proxy session lookup failed", {
      message: redactPII(errorMessage(err, "Unknown error")),
    });
  }

  return null;
}

async function proxyJmapRequest(input: {
  request: Request;
  upstreamPath: string;
  upstreamBaseUrl: string;
  mailService: IMailService;
  fetcher?: JmapProxyFetcher;
  retryWithFreshToken?: boolean;
  /** Buffered body so 401 token-refresh retries can reuse it. */
  bodyBuffer?: ArrayBuffer;
}): Promise<Response> {
  let authorization = input.request.headers.get("authorization");
  let authSource: "session" | "client-bearer" | "missing" = authorization
    ? "client-bearer"
    : "missing";

  try {
    const user = await resolveSessionUserForProxy(input.request);
    if (user) {
      const email = user.email?.trim();
      if (email) {
        if (input.retryWithFreshToken) {
          input.mailService.invalidateAccessTokenForUser(user.id);
        }
        const token = await input.mailService.getAccessTokenForUser({
          userId: user.id,
          email,
        });
        authorization = `Bearer ${token.access_token}`;
        authSource = "session";
      }
    }
  } catch (err) {
    logger.debug("JMAP proxy could not resolve session user for upstream auth", {
      message: redactPII(errorMessage(err, "Unknown error")),
      hadClientBearer: Boolean(input.request.headers.get("authorization")),
    });
  }

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
      : (input.bodyBuffer ?? (await input.request.arrayBuffer()));

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
      upstreamUrl: sanitizeRequestUrl(upstreamUrl),
      method,
      token: summarizeBearerToken(authorization),
      message: redactPII(message),
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
    const operation = classifyJmapProxyOperation(input.upstreamPath);
    const requestSummary = summarizeJmapRequestBody(requestBody);

    if (
      response.status === 401 &&
      authSource === "session" &&
      !input.retryWithFreshToken
    ) {
      logger.debug(
        "JMAP proxy refreshing session token after upstream 401",
        {
          operation,
          upstreamUrl: sanitizeRequestUrl(upstreamUrl),
          method,
          methodCalls: requestSummary.methodCalls,
        },
      );
      return proxyJmapRequest({
        ...input,
        bodyBuffer: requestBody,
        retryWithFreshToken: true,
      });
    }

    let upstreamBody: string | null = null;
    try {
      upstreamBody = await response.clone().text();
    } catch {
      upstreamBody = null;
    }

    const logPayload = {
      operation,
      authSource,
      retriedWithFreshToken: Boolean(input.retryWithFreshToken),
      proxyPath: requestUrl.pathname,
      upstreamUrl: sanitizeRequestUrl(upstreamUrl),
      method,
      status: response.status,
      token: summarizeBearerToken(authorization),
      request: requestSummary,
      upstreamError: summarizeUpstreamErrorBody(upstreamBody),
    };

    const isSendFailure =
      response.status === 401 &&
      (operation === "blob-upload" || requestIncludesSendIntent(requestSummary));

    if (response.status >= 500 || isSendFailure) {
      logger.error("JMAP proxy upstream responded with an error", logPayload);
    } else {
      logger.warn("JMAP proxy upstream responded with an error", logPayload);
    }
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
  const authDetail = authenticatedRouteDetail("Mail");

  return new Elysia({
    prefix: "/mail",
    normalize: false,
  })
    .get("/config", {
      detail: {
        tags: ["Mail"],
        summary: "Get public mail-demo configuration",
        description:
          "Returns the public mailbox domain and Stalwart discovery base used by the mail demo.",
      },
    }, () => mailService.getConfig())
    .get("/keys/:email", {
      detail: {
        tags: ["Mail"],
        summary: "Look up an internal recipient public key",
        description:
          "Returns the stored OpenPGP public key directory entry for an internal mailbox.",
      },
    }, async ({ params }) => {
      try {
        return await mailService.getDirectoryKey(params.email);
      } catch (err) {
        logger.error("Failed to look up internal recipient key", {
          recipientRef: logRef(params.email),
          ...errorLogDetails(err),
        });
        throw err;
      }
    })
    .all("/jmap/.well-known/jmap", {
      detail: {
        tags: ["Mail"],
        summary: "Proxy JMAP discovery for the mail demo",
        description:
          "Forwards JMAP discovery to the configured Stalwart instance so browser clients can operate without direct cross-origin access.",
      },
    }, ({ request }) =>
      proxyJmapRequest({
        request,
        upstreamPath: "/.well-known/jmap",
        upstreamBaseUrl: jmapUpstreamBaseUrl,
        fetcher: jmapFetch,
        mailService,
      }))
    .all("/jmap/jmap", {
      detail: {
        tags: ["Mail"],
        summary: "Proxy root JMAP calls for the mail demo",
        description:
          "Forwards authenticated JMAP calls to Stalwart while keeping private-key operations in the browser.",
      },
    }, ({ request }) =>
      proxyJmapRequest({
        request,
        upstreamPath: "/jmap/",
        upstreamBaseUrl: jmapUpstreamBaseUrl,
        fetcher: jmapFetch,
        mailService,
      }))
    .all("/jmap/jmap/", {
      detail: {
        tags: ["Mail"],
        summary: "Proxy root JMAP calls for the mail demo",
        description:
          "Forwards authenticated JMAP calls to Stalwart while keeping private-key operations in the browser.",
      },
    }, ({ request }) =>
      proxyJmapRequest({
        request,
        upstreamPath: "/jmap/",
        upstreamBaseUrl: jmapUpstreamBaseUrl,
        fetcher: jmapFetch,
        mailService,
      }))
    .all("/jmap/jmap/*", {
      detail: {
        tags: ["Mail"],
        summary: "Proxy nested JMAP resources for the mail demo",
        description:
          "Forwards nested JMAP download, upload, and event-source requests to Stalwart through the backend proxy.",
      },
    }, ({ params, request }) =>
      proxyJmapRequest({
        request,
        upstreamPath: `/jmap/${params["*"]}`,
        upstreamBaseUrl: jmapUpstreamBaseUrl,
        fetcher: jmapFetch,
        mailService,
      }))
    .use(
      requireAuth.guard(authenticatedRouteDetail("Mail"), (app) =>
        app.get("/oauth/access-token", {
          detail: {
            ...authDetail.detail,
            summary: "Exchange session for a mail OAuth access token",
            description:
              "Performs a server-side OAuth authorization code flow using the caller's session cookie and returns a JWT access token accepted by the mail server.",
          },
        }, async ({ routeUser, status }) => {
          const userId = routeUser.id;
          const email = routeUser.email?.trim();
          if (!email) {
            return status(
              401,
              unauthorizedBody(
                "A valid session is required to obtain a mail token.",
              ),
            );
          }
        
          try {
            return await mailService.getAccessTokenForUser({
              userId,
              email,
            });
          } catch (err) {
            const message = errorMessage(err, "Could not issue mail token.");
            logger.error("Failed to issue mail access token", {
              userId,
              recipientRef: logRef(email),
              ...errorLogDetails(err),
            });
            return status(
              400,
              createApiErrorBody(400, "mail_token_error", message),
            );
          }
        })
    .get("/vault-key-material", {
      detail: {
        ...authDetail.detail,
        summary: "Get server-derived vault key material",
        description:
          "Returns an HMAC-SHA256 derived key material unique to the authenticated user. Used client-side to derive the vault encryption key without a user-typed password.",
      },
    }, async ({ routeUser, status }) => {
      const userId = routeUser.id;
      try {
        const keyMaterial = await deriveVaultKeyMaterial(userId);
        let derivedKeyB64: string | null = null;
        try {
          derivedKeyB64 = await deriveVaultKeyForNative(userId, keyMaterial);
        } catch (derivedErr) {
          logger.error("[vault-key-material] deriveVaultKeyForNative failed", {
            userId,
            ...errorLogDetails(derivedErr),
          });
        }
        logger.debug(
          "[vault-key-material] responding hasDerivedKey=%s for userId=%s",
          derivedKeyB64 ? "yes" : "no",
          userId,
        );
        return { keyMaterial, derivedKeyB64, version: "v1" };
      } catch (err) {
        const message = errorMessage(
          err,
          "Could not derive vault key material.",
        );
        return status(
          500,
          createApiErrorBody(500, "vault_key_error", message),
        );
      }
    }),
    ),
    );
}

export const mailRoutes = createMailRoutes();
