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
import { errorMessage, RateLimitError } from "../lib/errors";
import {
  buildSafeJmapUpstreamUrl,
  JmapProxyPathError,
} from "../lib/jmap-proxy-path";
import { enforceRateLimit, getClientIp } from "../lib/rate-limit";
import { logRef, redactPII, sanitizeRequestUrl, errorLogDetails } from "../lib/log-sanitization";

type JmapProxyFetcher = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

const logger = createLogger("backend:mail-jmap-proxy");

const MAX_VAULT_MEMORY_KIB = 131_072;
const MAX_VAULT_ITERATIONS = 4;
const MAX_VAULT_PARALLELISM = 4;
const VAULT_KEY_MATERIAL_RATE_LIMIT = { requests: 10, windowMs: 60_000 };

let vaultDeriveChain: Promise<void> = Promise.resolve();

function withVaultDeriveMutex<T>(task: () => Promise<T>): Promise<T> {
  const run = vaultDeriveChain.then(task, task);
  vaultDeriveChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function vaultKdfParamsWithinServerCap(input: {
  kdfMemoryKiB: number;
  kdfIterations: number;
  kdfParallelism: number;
}): boolean {
  return (
    input.kdfMemoryKiB <= MAX_VAULT_MEMORY_KIB &&
    input.kdfIterations <= MAX_VAULT_ITERATIONS &&
    input.kdfParallelism <= MAX_VAULT_PARALLELISM
  );
}
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

  if (
    !vaultKdfParamsWithinServerCap({
      kdfMemoryKiB,
      kdfIterations,
      kdfParallelism,
    })
  ) {
    logger.warn(
      "[deriveVaultKeyForNative] refusing server derive — KDF params exceed cap for userId=%s",
      userId,
    );
    return null;
  }

  logger.debug(
    "[deriveVaultKeyForNative] running argon2id: memoryKiB=%d iterations=%d parallelism=%d saltLen=%d",
    kdfMemoryKiB, kdfIterations, kdfParallelism, kdfSaltB64.length,
  );

  // kdfSaltB64 may be standard base64 or base64url — normalize to standard before decode.
  const saltBase64 = kdfSaltB64.replace(/-/g, "+").replace(/_/g, "/");

  const { argon2id } = await import("hash-wasm");
  const derived = await withVaultDeriveMutex(() =>
    argon2id({
      password: keyMaterial,
      salt: Buffer.from(saltBase64, "base64"),
      memorySize: kdfMemoryKiB,
      iterations: kdfIterations,
      parallelism: kdfParallelism,
      hashLength: 32,
      outputType: "binary",
    }),
  );

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
    const rawCalls = parsed.methodCalls ?? [];
    const methodCalls = rawCalls
      .map((call) => (Array.isArray(call) ? call[0] : null))
      .filter((method): method is string => typeof method === "string");

    const methodCallDetails = rawCalls
      .map((call) => summarizeJmapMethodCall(call))
      .filter((detail): detail is Record<string, unknown> => detail !== null);

    return {
      bodyPresent: true,
      bodyLength: requestBody.byteLength,
      using: parsed.using,
      methodCalls,
      methodCallDetails,
    };
  } catch {
    return {
      bodyPresent: true,
      bodyLength: requestBody.byteLength,
      bodyFormat: "non-json",
    };
  }
}

/** Safe, PII-free summary of one JMAP methodCall for slow-query logs. */
function summarizeJmapMethodCall(
  call: unknown,
): Record<string, unknown> | null {
  if (!Array.isArray(call) || typeof call[0] !== "string") {
    return null;
  }
  const method = call[0];
  const args =
    call[1] && typeof call[1] === "object"
      ? (call[1] as Record<string, unknown>)
      : {};
  const properties = Array.isArray(args.properties)
    ? args.properties.filter((value): value is string => typeof value === "string")
    : null;
  const ids = Array.isArray(args.ids) ? args.ids : null;
  const detail: Record<string, unknown> = {
    method,
    callId: typeof call[2] === "string" ? call[2] : undefined,
  };

  if (typeof args.accountId === "string") {
    detail.accountIdLen = args.accountId.length;
  }
  if (typeof args.limit === "number") {
    detail.limit = args.limit;
  }
  if (ids) {
    detail.idsCount = ids.length;
  }
  if (args["#ids"] && typeof args["#ids"] === "object") {
    detail.idsFromResultOf = true;
  }
  if (properties) {
    detail.propertiesCount = properties.length;
    detail.requestsBody =
      properties.some(
        (property) =>
          property === "bodyValues" ||
          property === "textBody" ||
          property === "htmlBody" ||
          property === "bodyStructure" ||
          property.startsWith("body."),
      ) || Boolean(args.fetchTextBodyValues) || Boolean(args.fetchHTMLBodyValues) || Boolean(args.fetchAllBodyValues);
    detail.propertySample = properties.slice(0, 8);
  }
  if (args.filter && typeof args.filter === "object") {
    detail.filterKeys = Object.keys(args.filter as Record<string, unknown>).slice(
      0,
      8,
    );
  }
  if (Array.isArray(args.sort)) {
    detail.sortCount = args.sort.length;
  }
  return detail;
}

function quoteServerTimingDesc(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
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
  /** Auth source used on the previous attempt (for invalidate policy). */
  previousAuthSource?: "session" | "client-bearer" | "missing";
  /** Buffered body so 401 token-refresh retries can reuse it. */
  bodyBuffer?: ArrayBuffer;
}): Promise<Response> {
  const timingStart = performance.now();
  const clientAuthorization = input.request.headers.get("authorization");

  let authorization = clientAuthorization;
  let authSource: "session" | "client-bearer" | "missing" = clientAuthorization
    ? "client-bearer"
    : "missing";

  // Prefer a client-supplied Stalwart Bearer when present. After we stopped
  // resetting the bridge password on every isolate cold-start, these tokens
  // stay valid and skipping session mint saves ~200–400ms of getSession+cache
  // work on every JMAP call. Fall back to session mint when there is no
  // bearer, or after an upstream 401 (retryWithFreshToken).
  const shouldMintFromSession =
    Boolean(input.retryWithFreshToken) || !clientAuthorization;

  let authMs = 0;
  let sessionMs = 0;
  let tokenMs = 0;
  if (shouldMintFromSession) {
    const authStart = performance.now();
    try {
      const sessionStart = performance.now();
      const user = await resolveSessionUserForProxy(input.request);
      sessionMs = performance.now() - sessionStart;
      if (user) {
        const email = user.email?.trim();
        if (email) {
          // Only invalidate after a session-minted token itself 401'd.
          // Invalidating on client-bearer fallback wiped the warm cache and
          // forced a full Stalwart OAuth mint on every proxied call.
          if (
            input.retryWithFreshToken &&
            input.previousAuthSource === "session"
          ) {
            input.mailService.invalidateAccessTokenForUser(user.id);
          }
          const tokenStart = performance.now();
          const token = await input.mailService.getAccessTokenForUser({
            userId: user.id,
            email,
          });
          tokenMs = performance.now() - tokenStart;
          authorization = `Bearer ${token.access_token}`;
          authSource = "session";
        }
      }
    } catch (err) {
      logger.debug(
        "JMAP proxy could not resolve session user for upstream auth",
        {
          message: redactPII(errorMessage(err, "Unknown error")),
          hadClientBearer: Boolean(clientAuthorization),
        },
      );
    }
    authMs = performance.now() - authStart;
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
  let upstreamUrl: string;
  try {
    upstreamUrl = buildSafeJmapUpstreamUrl(
      input.upstreamBaseUrl,
      input.upstreamPath,
      requestUrl.search,
    );
  } catch (error) {
    if (error instanceof JmapProxyPathError) {
      return Response.json(
        {
          error: "Bad request",
          message: error.message,
          statusCode: 400,
          timestamp: new Date().toISOString(),
        },
        { status: 400 },
      );
    }
    throw error;
  }
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
  const upstreamStart = performance.now();
  try {
    response = await (input.fetcher ?? fetch)(upstreamUrl, {
      method,
      headers,
      body:
        requestBody && requestBody.byteLength > 0 ? requestBody : undefined,
      redirect: "manual",
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
  const upstreamMs = performance.now() - upstreamStart;
  const totalMs = performance.now() - timingStart;
  const requestSummary = summarizeJmapRequestBody(requestBody);
  const operation = classifyJmapProxyOperation(input.upstreamPath);
  const methodCalls = Array.isArray(requestSummary.methodCalls)
    ? (requestSummary.methodCalls as string[])
    : [];
  const opDesc =
    methodCalls.length > 0
      ? methodCalls.slice(0, 4).join("+")
      : operation;
  const responseContentLengthHeader = response.headers.get("content-length");
  const responseContentLength = responseContentLengthHeader
    ? Number(responseContentLengthHeader)
    : null;

  // Threshold is intentionally low so we can see the 1–3s Vercel→Stalwart
  // outliers the browser reports even when auth is already free.
  if (upstreamMs >= 400) {
    const slowPayload = {
      event: "jmap_proxy_slow_upstream",
      operation,
      methodCalls,
      methodCallDetails: requestSummary.methodCallDetails ?? [],
      requestBodyBytes:
        typeof requestSummary.bodyLength === "number"
          ? requestSummary.bodyLength
          : requestBody?.byteLength ?? 0,
      responseStatus: response.status,
      responseContentLength: Number.isFinite(responseContentLength)
        ? responseContentLength
        : null,
      responseContentType: response.headers.get("content-type"),
      authSource,
      retriedWithFreshToken: Boolean(input.retryWithFreshToken),
      timingMs: {
        auth: Math.round(authMs),
        session: Math.round(sessionMs),
        token: Math.round(tokenMs),
        upstream: Math.round(upstreamMs),
        total: Math.round(totalMs),
      },
      upstreamUrl: sanitizeRequestUrl(upstreamUrl),
      proxyPath: requestUrl.pathname,
      httpMethod: method,
      vercelId: input.request.headers.get("x-vercel-id"),
      vercelRegion:
        input.request.headers.get("x-vercel-id")?.split("::")[0] ?? null,
    };
    // info (not debug) so it always shows in Vercel production logs.
    logger.info("JMAP proxy slow upstream", slowPayload);
    // Distinct single-line marker for easy `vercel logs` grepping.
    console.info(`JMAP_SLOW_UPSTREAM ${JSON.stringify(slowPayload)}`);
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

  responseHeaders.set(
    "Server-Timing",
    [
      `auth;dur=${authMs.toFixed(1)}`,
      `session;dur=${sessionMs.toFixed(1)}`,
      `token;dur=${tokenMs.toFixed(1)}`,
      `upstream;dur=${upstreamMs.toFixed(1)}`,
      `total;dur=${totalMs.toFixed(1)}`,
      `auth_source;desc=${quoteServerTimingDesc(authSource)}`,
      `retry;desc=${quoteServerTimingDesc(input.retryWithFreshToken ? "1" : "0")}`,
      `op;desc=${quoteServerTimingDesc(opDesc.slice(0, 80) || "unknown")}`,
    ].join(", "),
  );

  if (!response.ok) {
    if (response.status === 401 && !input.retryWithFreshToken) {
      logger.debug(
        "JMAP proxy refreshing upstream auth after 401",
        {
          operation,
          authSource,
          token: summarizeBearerToken(authorization),
          upstreamUrl: sanitizeRequestUrl(upstreamUrl),
          method,
          methodCalls: requestSummary.methodCalls,
        },
      );
      return proxyJmapRequest({
        ...input,
        bodyBuffer: requestBody,
        retryWithFreshToken: true,
        previousAuthSource: authSource,
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
      timingMs: {
        auth: Math.round(authMs),
        upstream: Math.round(upstreamMs),
        total: Math.round(performance.now() - timingStart),
      },
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
    }, async ({ params, request }) => {
      const sessionUser = await resolveSessionUserForProxy(request);
      const rateLimitKey = sessionUser?.id
        ? `user:${sessionUser.id}`
        : `ip:${getClientIp(request)}`;
      try {
        enforceRateLimit({
          storeId: "mail-directory-keys",
          key: rateLimitKey,
          limit: { requests: 60, windowMs: 60_000 },
        });
      } catch (error) {
        if (error instanceof RateLimitError) {
          return Response.json(
            {
              error: "Too many requests",
              message: error.message,
              statusCode: 429,
              timestamp: new Date().toISOString(),
            },
            { status: 429 },
          );
        }
        throw error;
      }

      try {
        return await mailService.getDirectoryKey(params.email, {
          allowRemoteResolve: Boolean(sessionUser),
        });
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
          "Returns an HMAC-SHA256 derived key material unique to the authenticated user. Used client-side to derive the vault encryption key without a user-typed password. Pass includeDerived=0 to skip the expensive argon2id derived AES key when the client already has it cached.",
      },
    }, async ({ routeUser, status, request }) => {
      const userId = routeUser.id;
      try {
        enforceRateLimit({
          storeId: "vault-key-material",
          key: userId,
          limit: VAULT_KEY_MATERIAL_RATE_LIMIT,
        });
      } catch (error) {
        if (error instanceof RateLimitError) {
          return status(429, {
            error: "Too many requests",
            message: error.message,
            statusCode: 429,
            timestamp: new Date().toISOString(),
          });
        }
        throw error;
      }
      const includeDerived =
        new URL(request.url).searchParams.get("includeDerived") !== "0";
      try {
        const keyMaterial = await deriveVaultKeyMaterial(userId);
        let derivedKeyB64: string | null = null;
        if (includeDerived) {
          try {
            derivedKeyB64 = await deriveVaultKeyForNative(userId, keyMaterial);
          } catch (derivedErr) {
            logger.error("[vault-key-material] deriveVaultKeyForNative failed", {
              userId,
              ...errorLogDetails(derivedErr),
            });
          }
        }
        logger.debug(
          "[vault-key-material] responding hasDerivedKey=%s includeDerived=%s for userId=%s",
          derivedKeyB64 ? "yes" : "no",
          includeDerived ? "yes" : "no",
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
