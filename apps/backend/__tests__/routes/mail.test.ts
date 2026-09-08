import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Elysia } from "elysia";

jest.mock("../../lib/auth", () => ({
  auth: { api: { getSession: jest.fn() } },
}));

jest.mock("../../lib/prisma", () => ({
  prisma: {},
}));

jest.mock("../../lib/passkey-step-up", () => ({
  hasVerifiedPasskeyStepUp: jest.fn(() => false),
  getPasskeyStepUpStatus: jest.fn(async () => ({
    hasPasskeys: false,
    isPasskeyStepUpVerified: false,
    requiresPasskeyStepUp: false,
  })),
}));

const mockMailOAuthConfig = {
  issuer: "https://api.solace.test/api/auth",
  discoveryUrl:
    "https://api.solace.test/api/auth/.well-known/openid-configuration",
  authorizationEndpoint: "https://api.solace.test/api/auth/oauth2/authorize",
  tokenEndpoint: "https://api.solace.test/api/auth/oauth2/token",
  userinfoEndpoint: "https://api.solace.test/api/auth/oauth2/userinfo",
  jwksUri: "https://api.solace.test/api/auth/jwks",
  mailTokenEndpoint: "https://api.solace.test/api/mail/oauth/access-token",
  clientId: "solace-mail-browser",
  redirectUri: "https://app.solace.test/mail/oauth/callback",
  scopes: ["openid", "email"],
  audiences: ["https://mail.solace.onl"],
};

const mockMailService = {
  getConfig: jest.fn(async () => ({
    defaultDomain: "solace.onl",
    discoveryBaseUrl: "http://localhost:8080",
    signupEnabled: true,
    oauth: mockMailOAuthConfig,
    vaultKeyMaterialEndpoint:
      "https://api.solace.test/api/mail/vault-key-material",
  })),
  issueAccessTokenForUser: jest.fn(async () => ({
    access_token: "stalwart-access-token",
    expires_in: 1800,
    expires_at: 1779149999,
  })),
  getAccessTokenForUser: jest.fn(async () => ({
    access_token: "stalwart-access-token",
    expires_in: 1800,
    expires_at: 1779149999,
  })),
  invalidateAccessTokenForUser: jest.fn(),
  getMailboxStatusForUser: jest.fn(async () => ({
    email: "alice@solace.onl",
    displayName: "Alice Example",
    provisioned: true,
  })),
  bootstrapForUser: jest.fn(async () => ({
    email: "alice@solace.onl",
    displayName: "Alice Example",
    stalwartAccountId: "acct-1",
    stalwartPublicKeyId: "pk-1",
    fingerprint: "ABCD1234EF567890",
    encryptionAtRestEnabled: true,
  })),
  getDirectoryKey: jest.fn(async () => ({
    email: "bob@solace.onl",
    publicKeyArmored: "recipient-public-key",
    fingerprint: "FACECAFE12345678",
    source: "internal",
    trust: "verified",
  })),
  getVaultBackup: jest.fn(async () => ({
    email: "alice@solace.onl",
    vaultVersion: 1,
    encryptedVaultB64: "vault-b64",
    kdf: "argon2id",
    kdfParams: {
      saltB64: "salt-b64",
      memoryKiB: 65536,
      iterations: 3,
      parallelism: 4,
    },
  })),
  getVaultBackupForUser: jest.fn(async () => ({
    email: "alice@solace.onl",
    vaultVersion: 1,
    encryptedVaultB64: "vault-b64",
    kdf: "argon2id",
    kdfParams: {
      saltB64: "salt-b64",
      memoryKiB: 65536,
      iterations: 3,
      parallelism: 4,
    },
  })),
  upsertVaultBackup: jest.fn(async () => ({
    email: "alice@solace.onl",
    vaultVersion: 1,
    encryptedVaultB64: "vault-b64",
    kdf: "argon2id",
    kdfParams: {
      saltB64: "salt-b64",
      memoryKiB: 65536,
      iterations: 3,
      parallelism: 4,
    },
  })),
  upsertVaultBackupForUser: jest.fn(async () => ({
    email: "alice@solace.onl",
    vaultVersion: 1,
    encryptedVaultB64: "vault-b64",
    kdf: "argon2id",
    kdfParams: {
      saltB64: "salt-b64",
      memoryKiB: 65536,
      iterations: 3,
      parallelism: 4,
    },
  })),
  deleteMailboxForUser: jest.fn(async () => undefined),
};

import { errorHandler } from "../../lib/errors";
import { auth } from "../../lib/auth";
import { createMailRoutes } from "../../routes/mail";

const mockGetSession = jest.mocked(auth.api.getSession);

function createApp(options?: {
  jmapFetch?: (input: string, init?: RequestInit) => Promise<Response>;
  jmapUpstreamBaseUrl?: string;
}) {
  return new Elysia({ normalize: false })
    .use(errorHandler)
    .use(createMailRoutes(mockMailService, options));
}

async function readJson(response: Response) {
  return response.json();
}

describe("mailRoutes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue(undefined as never);
  });

  it("proxies JMAP discovery through the backend", async () => {
    const proxyFetch = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(
          JSON.stringify({
            apiUrl: "https://mail.solace.onl/jmap/",
            accounts: {},
            primaryAccounts: {},
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
    );

    const response = await createApp({
      jmapFetch: proxyFetch,
      jmapUpstreamBaseUrl: "http://stalwart.test",
    }).handle(
      new Request("http://localhost/mail/jmap/.well-known/jmap", {
        headers: {
          Authorization: "Bearer mail-access-token",
          Accept: "application/json",
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      apiUrl: "https://mail.solace.onl/jmap/",
      accounts: {},
      primaryAccounts: {},
    });
    expect(proxyFetch).toHaveBeenCalledWith(
      "http://stalwart.test/.well-known/jmap",
      expect.objectContaining({
        method: "GET",
        headers: expect.any(Headers),
      }),
    );
    const upstreamHeaders = (proxyFetch.mock.calls[0]?.[1] as RequestInit)
      ?.headers as Headers;
    expect(upstreamHeaders.get("Authorization")).toBe(
      "Bearer mail-access-token",
    );
    expect(mockMailService.getAccessTokenForUser).not.toHaveBeenCalled();
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("forwards client Bearer when a session cookie is also present", async () => {
    const proxyFetch = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(JSON.stringify({ methodResponses: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    const response = await createApp({
      jmapFetch: proxyFetch,
      jmapUpstreamBaseUrl: "http://stalwart.test",
    }).handle(
      new Request("http://localhost/mail/jmap/jmap/", {
        method: "POST",
        headers: {
          // Browser clients send both; a valid Stalwart bearer must win so we
          // skip getSession on the hot path.
          Authorization: "Bearer client-provided-token",
          "Content-Type": "application/json",
          cookie: "better-auth.session_token=session-token",
        },
        body: JSON.stringify({
          using: ["urn:ietf:params:jmap:core"],
          methodCalls: [],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockMailService.getAccessTokenForUser).not.toHaveBeenCalled();
    const upstreamHeaders = (proxyFetch.mock.calls[0]?.[1] as RequestInit)
      ?.headers as Headers;
    expect(upstreamHeaders.get("Authorization")).toBe(
      "Bearer client-provided-token",
    );
    expect(response.headers.get("server-timing")).toContain(
      'auth_source;desc="client-bearer"',
    );
  });

  it("forwards client Bearer when no session cookie is present", async () => {
    const proxyFetch = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(JSON.stringify({ methodResponses: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    const response = await createApp({
      jmapFetch: proxyFetch,
      jmapUpstreamBaseUrl: "http://stalwart.test",
    }).handle(
      new Request("http://localhost/mail/jmap/jmap/", {
        method: "POST",
        headers: {
          Authorization: "Bearer client-provided-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          using: ["urn:ietf:params:jmap:core"],
          methodCalls: [],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockMailService.getAccessTokenForUser).not.toHaveBeenCalled();
    const upstreamHeaders = (proxyFetch.mock.calls[0]?.[1] as RequestInit)
      ?.headers as Headers;
    expect(upstreamHeaders.get("Authorization")).toBe(
      "Bearer client-provided-token",
    );
  });

  it("does not invalidate the token cache when falling back from client Bearer", async () => {
    mockGetSession.mockResolvedValue({
      session: { id: "session-1", userId: "user-1" },
      user: { id: "user-1", email: "alice@solace.onl" },
    } as never);
    // No session cookie → client bearer is tried first, then session fallback.
    const proxyFetch = jest
      .fn<(input: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ methodResponses: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const response = await createApp({
      jmapFetch: proxyFetch,
      jmapUpstreamBaseUrl: "http://stalwart.test",
    }).handle(
      new Request("http://localhost/mail/jmap/jmap/", {
        method: "POST",
        headers: {
          Authorization: "Bearer stale-client-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          using: ["urn:ietf:params:jmap:core"],
          methodCalls: [],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockMailService.invalidateAccessTokenForUser).not.toHaveBeenCalled();
    expect(mockMailService.getAccessTokenForUser).toHaveBeenCalledWith({
      userId: "user-1",
      email: "alice@solace.onl",
    });
    expect(proxyFetch).toHaveBeenCalledTimes(2);
  });

  it("mints a session mail token when the proxy request has no Bearer", async () => {
    mockGetSession.mockResolvedValue({
      session: { id: "session-1", userId: "user-1" },
      user: { id: "user-1", email: "alice@solace.onl" },
    } as never);
    const proxyFetch = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(JSON.stringify({ methodResponses: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    const response = await createApp({
      jmapFetch: proxyFetch,
      jmapUpstreamBaseUrl: "http://stalwart.test",
    }).handle(
      new Request("http://localhost/mail/jmap/jmap/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: "better-auth.session_token=session-token",
        },
        body: JSON.stringify({
          using: ["urn:ietf:params:jmap:core"],
          methodCalls: [],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockMailService.getAccessTokenForUser).toHaveBeenCalledWith({
      userId: "user-1",
      email: "alice@solace.onl",
    });
    const upstreamHeaders = (proxyFetch.mock.calls[0]?.[1] as RequestInit)
      ?.headers as Headers;
    expect(upstreamHeaders.get("Authorization")).toBe(
      "Bearer stalwart-access-token",
    );
  });

  it("proxies JMAP method calls through the backend", async () => {
    const proxyFetch = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(
          JSON.stringify({
            methodResponses: [["Mailbox/get", { list: [] }, "c1"]],
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
    );
    const requestBody = JSON.stringify({
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      methodCalls: [["Mailbox/get", { accountId: "b" }, "c1"]],
    });

    const response = await createApp({
      jmapFetch: proxyFetch,
      jmapUpstreamBaseUrl: "http://stalwart.test",
    }).handle(
      new Request("http://localhost/mail/jmap/jmap/", {
        method: "POST",
        headers: {
          Authorization: "Bearer mail-access-token",
          "Content-Type": "application/json",
        },
        body: requestBody,
      }),
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      methodResponses: [["Mailbox/get", { list: [] }, "c1"]],
    });
    expect(proxyFetch).toHaveBeenCalledWith(
      "http://stalwart.test/jmap/",
      expect.objectContaining({
        method: "POST",
        body: expect.any(ArrayBuffer),
        headers: expect.any(Headers),
      }),
    );
    const forwardedRequest = proxyFetch.mock.calls[0]?.[1];
    expect(forwardedRequest?.body).toBeInstanceOf(ArrayBuffer);
    expect(
      Buffer.from(forwardedRequest?.body as ArrayBuffer).toString("utf8"),
    ).toBe(requestBody);
  });

  it("preserves binary upload bodies when proxying JMAP attachments", async () => {
    const proxyFetch = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(async () => new Response(null, { status: 201 }));
    const attachmentBytes = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0x80,
    ]);

    const response = await createApp({
      jmapFetch: proxyFetch,
      jmapUpstreamBaseUrl: "http://stalwart.test",
    }).handle(
      new Request("http://localhost/mail/jmap/jmap/upload/account-1/", {
        method: "POST",
        headers: {
          Authorization: "Bearer mail-access-token",
          "Content-Type": "image/png",
        },
        body: attachmentBytes,
      }),
    );

    expect(response.status).toBe(201);
    expect(proxyFetch).toHaveBeenCalledWith(
      "http://stalwart.test/jmap/upload/account-1/",
      expect.objectContaining({
        method: "POST",
        body: expect.any(ArrayBuffer),
        headers: expect.any(Headers),
      }),
    );
    const forwardedRequest = proxyFetch.mock.calls[0]?.[1];
    expect(new Uint8Array(forwardedRequest?.body as ArrayBuffer)).toEqual(
      attachmentBytes,
    );
  });

  it("forwards proxy query strings and response cache headers for blob downloads", async () => {
    const proxyFetch = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response("raw-message", {
          status: 200,
          headers: {
            "Content-Type": "message/rfc822",
            "Cache-Control": "private, max-age=60",
          },
        }),
    );

    const response = await createApp({
      jmapFetch: proxyFetch,
      jmapUpstreamBaseUrl: "http://stalwart.test",
    }).handle(
      new Request(
        "http://localhost/mail/jmap/jmap/download/account-1/blob-1/message.eml?accept=message%2Frfc822",
        {
          headers: {
            Authorization: "Bearer mail-access-token",
            Accept: "message/rfc822",
          },
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("raw-message");
    expect(response.headers.get("content-type")).toBe("message/rfc822");
    expect(response.headers.get("cache-control")).toBe("private, max-age=60");
    expect(proxyFetch).toHaveBeenCalledWith(
      "http://stalwart.test/jmap/download/account-1/blob-1/message.eml?accept=message%2Frfc822",
      expect.objectContaining({
        method: "GET",
        headers: expect.any(Headers),
      }),
    );
  });

  it("returns a 503 error when the proxied JMAP upstream is unreachable", async () => {
    const proxyFetch = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(async () => {
      throw new Error("connect ECONNREFUSED");
    });

    const response = await createApp({
      jmapFetch: proxyFetch,
      jmapUpstreamBaseUrl: "http://stalwart.test",
    }).handle(
      new Request("http://localhost/mail/jmap/jmap/", {
        method: "POST",
        headers: {
          Authorization: "Bearer mail-access-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
          methodCalls: [["Mailbox/get", { accountId: "b" }, "c1"]],
        }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(readJson(response)).resolves.toEqual(
      expect.objectContaining({
        error: "Mail server unreachable",
        message: expect.stringContaining("connect ECONNREFUSED"),
      }),
    );
  });

  it("rejects path traversal attempts on nested JMAP proxy routes", async () => {
    const proxyFetch = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(async () => new Response(null, { status: 200 }));

    const traversalPaths = [
      "http://localhost/mail/jmap/jmap/%2e%2e%2f%2e%2e%2fapi/store/setting",
    ];

    for (const url of traversalPaths) {
      const response = await createApp({
        jmapFetch: proxyFetch,
        jmapUpstreamBaseUrl: "http://stalwart.test",
      }).handle(
        new Request(url, {
          headers: { Authorization: "Bearer mail-access-token" },
        }),
      );

      expect(response.status).toBe(400);
      expect(proxyFetch).not.toHaveBeenCalled();
      proxyFetch.mockClear();
    }
  });

  it("rejects proxied JMAP calls without mailbox credentials", async () => {
    const response = await createApp({
      jmapUpstreamBaseUrl: "http://stalwart.test",
    }).handle(new Request("http://localhost/mail/jmap/.well-known/jmap"));

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual(
      expect.objectContaining({
        error: "Unauthorized",
      }),
    );
  });

  it("returns public mail configuration", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/mail/config"),
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      defaultDomain: "solace.onl",
      discoveryBaseUrl: "http://localhost:8080",
      signupEnabled: true,
      oauth: mockMailOAuthConfig,
      vaultKeyMaterialEndpoint:
        "https://api.solace.test/api/mail/vault-key-material",
    });
  });

  it("exchanges the authenticated session for a backend-issued mail token", async () => {
    mockGetSession.mockResolvedValue({
      session: {
        id: "session-1",
        userId: "user-1",
      },
      user: {
        id: "user-1",
        email: "alice@solace.onl",
      },
    } as never);
    const response = await createApp().handle(
      new Request("http://localhost/mail/oauth/access-token", {
        headers: {
          cookie: "better-auth.session_token=session-token",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mockMailService.getAccessTokenForUser).toHaveBeenCalledWith({
      userId: "user-1",
      email: "alice@solace.onl",
    });
    await expect(readJson(response)).resolves.toEqual({
      access_token: "stalwart-access-token",
      expires_in: 1800,
      expires_at: 1779149999,
    });
  });

  it("returns a backend token error when the mail bridge rejects the session", async () => {
    mockGetSession.mockResolvedValue({
      session: {
        id: "session-1",
        userId: "user-1",
      },
      user: {
        id: "user-1",
        email: "alice@solace.onl",
      },
    } as never);
    mockMailService.getAccessTokenForUser.mockRejectedValueOnce(
      new Error("Stalwart mailbox login was rejected."),
    );

    const response = await createApp().handle(
      new Request("http://localhost/mail/oauth/access-token", {
        headers: {
          cookie: "better-auth.session_token=session-token",
        },
      }),
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "mail_token_error",
      message: "Stalwart mailbox login was rejected.",
      statusCode: 400,
      timestamp: expect.any(String),
    });
  });

  it("returns internal recipient keys for compose encryption", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/mail/keys/bob@solace.onl"),
    );

    expect(response.status).toBe(200);
    expect(mockMailService.getDirectoryKey).toHaveBeenCalledWith(
      "bob@solace.onl",
      { allowRemoteResolve: false },
    );
    await expect(readJson(response)).resolves.toEqual({
      email: "bob@solace.onl",
      publicKeyArmored: "recipient-public-key",
      fingerprint: "FACECAFE12345678",
      source: "internal",
      trust: "verified",
    });
  });
});
