import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Elysia } from "elysia";

jest.mock("../../lib/auth", () => ({
  auth: { api: { getSession: jest.fn() } },
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
  getConfig: jest.fn(() => ({
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
        body: requestBody,
        headers: expect.any(Headers),
      }),
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
    expect(mockMailService.issueAccessTokenForUser).toHaveBeenCalledWith({
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
        email: "alice@solace.onl",
      },
    } as never);
    mockMailService.issueAccessTokenForUser.mockRejectedValueOnce(
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
    });
  });

  it("returns internal recipient keys for compose encryption", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/mail/keys/bob@solace.onl"),
    );

    expect(response.status).toBe(200);
    expect(mockMailService.getDirectoryKey).toHaveBeenCalledWith(
      "bob@solace.onl",
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
