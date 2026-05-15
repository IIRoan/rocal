import { Elysia } from "elysia";
import type { IMailService, MailOAuthConfig } from "../contracts/mail.contract";
import { BETTER_AUTH_BASE_PATH } from "../lib/auth-constants";
import { createLogger } from "@workspace/logger";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { MailService } from "../services/mail.service";
import { createStalwartAdminClient } from "../lib/stalwart-admin";

type JmapProxyFetcher = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
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
