import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Elysia } from "elysia";

const mockMailService = {
  getConfig: jest.fn(() => ({
    defaultDomain: "solace.onl",
    discoveryBaseUrl: "http://localhost:8080",
    signupEnabled: true,
    loginMode: "basic" as const,
  })),
  getMailboxStatusForUser: jest.fn(async () => ({
    email: "alice@solace.onl",
    displayName: "Alice Example",
    provisioned: true,
  })),
  signUp: jest.fn(async () => ({
    email: "alice@solace.onl",
    displayName: "Alice Example",
    stalwartAccountId: "acct-1",
    stalwartPublicKeyId: "pk-1",
    fingerprint: "ABCD1234EF567890",
    encryptionAtRestEnabled: true,
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
import { createMailRoutes } from "../../routes/mail";

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
  });

  it("proxies JMAP discovery through the backend", async () => {
    const proxyFetch = jest.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(async () =>
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
          Authorization: "Basic mailbox-auth",
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
    >(async () =>
      new Response(
        JSON.stringify({ methodResponses: [["Mailbox/get", { list: [] }, "c1"]] }),
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
          Authorization: "Basic mailbox-auth",
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
    >(async () =>
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
            Authorization: "Basic mailbox-auth",
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
          Authorization: "Basic mailbox-auth",
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
      loginMode: "basic",
    });
  });

  it("provisions a mailbox from the signup route", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/mail/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: "Alice Example",
          localPart: "alice",
          password: "StrongMailboxPassword!42",
          publicKeyArmored: "public-key-armored",
          fingerprint: "ABCD1234EF567890",
          algorithm: "openpgp",
          createdAt: "2026-05-06T21:00:00.000Z",
          vaultVersion: 1,
          encryptedVaultB64: "vault-b64",
          kdf: "argon2id",
          kdfParams: {
            saltB64: "salt-b64",
            memoryKiB: 65536,
            iterations: 3,
            parallelism: 4,
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockMailService.signUp).toHaveBeenCalledWith({
      displayName: "Alice Example",
      localPart: "alice",
      password: "StrongMailboxPassword!42",
      publicKeyArmored: "public-key-armored",
      fingerprint: "ABCD1234EF567890",
      algorithm: "openpgp",
      createdAt: "2026-05-06T21:00:00.000Z",
      vaultVersion: 1,
      encryptedVaultB64: "vault-b64",
      kdf: "argon2id",
      kdfParams: {
        saltB64: "salt-b64",
        memoryKiB: 65536,
        iterations: 3,
        parallelism: 4,
      },
    });
    await expect(readJson(response)).resolves.toEqual({
      email: "alice@solace.onl",
      displayName: "Alice Example",
      stalwartAccountId: "acct-1",
      stalwartPublicKeyId: "pk-1",
      fingerprint: "ABCD1234EF567890",
      encryptionAtRestEnabled: true,
    });
  });

  it("rejects unexpected signup fields", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/mail/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: "Alice Example",
          localPart: "alice",
          password: "StrongMailboxPassword!42",
          publicKeyArmored: "public-key-armored",
          fingerprint: "ABCD1234EF567890",
          algorithm: "openpgp",
          createdAt: "2026-05-06T21:00:00.000Z",
          vaultVersion: 1,
          encryptedVaultB64: "vault-b64",
          kdf: "argon2id",
          kdfParams: {
            saltB64: "salt-b64",
            memoryKiB: 65536,
            iterations: 3,
            parallelism: 4,
          },
          unexpected: true,
        }),
      }),
    );

    expect(response.status).toBe(422);
    expect(mockMailService.signUp).not.toHaveBeenCalled();
    await expect(readJson(response)).resolves.toEqual(
      expect.objectContaining({
        type: "validation",
      }),
    );
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

  it("returns encrypted vault backups for mailbox restore", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/mail/vault/backup/alice@solace.onl"),
    );

    expect(response.status).toBe(200);
    expect(mockMailService.getVaultBackup).toHaveBeenCalledWith(
      "alice@solace.onl",
    );
    await expect(readJson(response)).resolves.toEqual({
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
    });
  });

  it("stores encrypted vault backup updates from the public restore route", async () => {
    const requestBody = {
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
    };

    const response = await createApp().handle(
      new Request("http://localhost/mail/vault/backup", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockMailService.upsertVaultBackup).toHaveBeenCalledWith(requestBody);
    await expect(readJson(response)).resolves.toEqual(requestBody);
  });

  it("rejects unexpected fields when storing a public encrypted vault backup", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/mail/vault/backup", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
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
          unexpected: true,
        }),
      }),
    );

    expect(response.status).toBe(422);
    expect(mockMailService.upsertVaultBackup).not.toHaveBeenCalled();
    await expect(readJson(response)).resolves.toEqual(
      expect.objectContaining({
        type: "validation",
      }),
    );
  });
});
