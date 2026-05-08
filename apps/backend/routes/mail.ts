import { Elysia, t } from "elysia";
import type { IMailService } from "../contracts/mail.contract";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { strictObject } from "../lib/validation";
import { MailService } from "../services/mail.service";
import { createStalwartAdminClient } from "../lib/stalwart-admin";

type JmapProxyFetcher = (input: string, init?: RequestInit) => Promise<Response>;

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

const publicJmapProxyBaseUrl = `${normalizeBaseUrl(env.backendUrl)}/api/mail/jmap`;

export const defaultMailService = new MailService(prisma, createStalwartAdminClient(), {
  defaultDomain: env.stalwartDefaultDomain,
  discoveryBaseUrl: publicJmapProxyBaseUrl,
});

const kdfParamsSchema = strictObject({
  saltB64: t.String({
    minLength: 1,
    maxLength: 512,
  }),
  memoryKiB: t.Number({
    minimum: 8192,
    maximum: 1048576,
  }),
  iterations: t.Number({
    minimum: 1,
    maximum: 16,
  }),
  parallelism: t.Number({
    minimum: 1,
    maximum: 32,
  }),
});

const signupBodySchema = strictObject({
  displayName: t.Optional(
    t.String({
      maxLength: 120,
    }),
  ),
  localPart: t.String({
    minLength: 1,
    maxLength: 64,
  }),
  password: t.String({
    minLength: 12,
    maxLength: 256,
  }),
  publicKeyArmored: t.String({
    minLength: 1,
    maxLength: 131072,
  }),
  fingerprint: t.String({
    minLength: 16,
    maxLength: 128,
  }),
  algorithm: t.String({
    minLength: 1,
    maxLength: 32,
  }),
  createdAt: t.String({
    minLength: 1,
    maxLength: 64,
  }),
  vaultVersion: t.Number({
    minimum: 1,
    maximum: 10,
  }),
  encryptedVaultB64: t.String({
    minLength: 1,
    maxLength: 500000,
  }),
  kdf: t.String({
    minLength: 1,
    maxLength: 32,
  }),
  kdfParams: kdfParamsSchema,
});

const vaultBackupBodySchema = strictObject({
  email: t.String({
    minLength: 3,
    maxLength: 255,
  }),
  vaultVersion: t.Number({
    minimum: 1,
    maximum: 10,
  }),
  encryptedVaultB64: t.String({
    minLength: 1,
    maxLength: 500000,
  }),
  kdf: t.String({
    minLength: 1,
    maxLength: 32,
  }),
  kdfParams: kdfParamsSchema,
});

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
    const message = err instanceof Error ? err.message : "Unknown network error";
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
  const jmapUpstreamBaseUrl = options.jmapUpstreamBaseUrl ?? env.stalwartBaseUrl;

  return new Elysia({
    prefix: "/mail",
    normalize: false,
  })
    .get(
      "/config",
      () => mailService.getConfig(),
      {
        detail: {
          tags: ["Mail"],
          summary: "Get public mail-demo configuration",
          description:
            "Returns the public mailbox domain and Stalwart discovery base used by the mail demo.",
        },
      },
    )
    .post(
      "/signup",
      async ({ body }) => mailService.signUp(body),
      {
        body: signupBodySchema,
        detail: {
          tags: ["Mail"],
          summary: "Provision a new Stalwart mailbox for the mail demo",
          description:
            "Creates a Stalwart mailbox, registers the client-generated OpenPGP public key, enables encryption at rest, and stores the encrypted private-key vault backup metadata.",
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
    .get(
      "/vault/backup/:email",
      async ({ params }) => mailService.getVaultBackup(params.email),
      {
        detail: {
          tags: ["Mail"],
          summary: "Fetch an encrypted vault backup",
          description:
            "Returns the encrypted private-key vault backup for mailbox restore flows. The server never decrypts the vault.",
        },
      },
    )
    .put(
      "/vault/backup",
      async ({ body }) => mailService.upsertVaultBackup(body),
      {
        body: vaultBackupBodySchema,
        detail: {
          tags: ["Mail"],
          summary: "Create or replace an encrypted vault backup",
          description:
            "Stores ciphertext-only vault backup material for mailbox restore across devices.",
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