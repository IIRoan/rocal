import { describe, expect, it, jest } from "@jest/globals";
import { Elysia } from "elysia";

jest.mock("../../lib/auth-utils", () => ({
  ensureAuthenticatedUser: jest.fn(
    async (): Promise<any> => ({
      id: "user-1",
      email: "alice@solace.onl",
      name: "Alice Example",
    }),
  ),
}));

jest.mock("../../lib/auth", () => ({
  auth: { api: { getSession: jest.fn() } },
}));

jest.mock("../../lib/auth-guard", () => {
  const { Elysia: LocalElysia } =
    jest.requireActual<typeof import("elysia")>("elysia");
  return {
    requireAuth: new LocalElysia({ name: "require-auth-mail-test" }),
  };
});

const mockMailOAuthConfig = {
  issuer: "https://api.solace.test/api/auth",
  discoveryUrl:
    "https://api.solace.test/api/auth/.well-known/openid-configuration",
  authorizationEndpoint: "https://api.solace.test/api/auth/oauth2/authorize",
  tokenEndpoint: "https://api.solace.test/api/auth/oauth2/token",
  userinfoEndpoint: "https://api.solace.test/api/auth/oauth2/userinfo",
  jwksUri: "https://api.solace.test/api/auth/jwks",
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
  getDirectoryKey: jest.fn(),
  getVaultBackup: jest.fn(),
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
  upsertVaultBackup: jest.fn(),
  upsertVaultBackupForUser: jest.fn(async () => ({
    email: "alice@solace.onl",
    vaultVersion: 2,
    encryptedVaultB64: "vault-b64-updated",
    kdf: "argon2id",
    kdfParams: {
      saltB64: "salt-b64",
      memoryKiB: 131072,
      iterations: 4,
      parallelism: 2,
    },
  })),
};

import { errorHandler } from "../../lib/errors";
import { createMailAccountRoutes } from "../../routes/mail-account";

function createApp() {
  return new Elysia({ normalize: false })
    .use(errorHandler)
    .use(createMailAccountRoutes(mockMailService as any));
}

async function readJson(response: Response) {
  return response.json();
}

describe("mailAccountRoutes", () => {
  it("returns mailbox status for the authenticated Solace account", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/mail/account/"),
    );

    expect(response.status).toBe(200);
    expect(mockMailService.getMailboxStatusForUser).toHaveBeenCalledWith({
      userId: "user-1",
      email: "alice@solace.onl",
      displayName: "Alice Example",
    });
    await expect(readJson(response)).resolves.toEqual({
      email: "alice@solace.onl",
      displayName: "Alice Example",
      provisioned: true,
    });
  });

  it("bootstraps a mailbox for the authenticated Solace account", async () => {
    const requestBody = {
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
    };

    const response = await createApp().handle(
      new Request("http://localhost/mail/account/bootstrap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockMailService.bootstrapForUser).toHaveBeenCalledWith({
      userId: "user-1",
      email: "alice@solace.onl",
      displayName: "Alice Example",
      ...requestBody,
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

  it("accepts passwordless mailbox bootstrap payloads", async () => {
    const requestBody = {
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
    };

    const response = await createApp().handle(
      new Request("http://localhost/mail/account/bootstrap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockMailService.bootstrapForUser).toHaveBeenCalledWith({
      userId: "user-1",
      email: "alice@solace.onl",
      displayName: "Alice Example",
      ...requestBody,
    });
  });

  it("rejects unexpected fields when bootstrapping an authenticated mailbox", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/mail/account/bootstrap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
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
    expect(mockMailService.bootstrapForUser).not.toHaveBeenCalled();
    await expect(readJson(response)).resolves.toEqual(
      expect.objectContaining({
        type: "validation",
      }),
    );
  });

  it("returns the authenticated user's encrypted vault backup", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/mail/account/vault-backup"),
    );

    expect(response.status).toBe(200);
    expect(mockMailService.getVaultBackupForUser).toHaveBeenCalledWith({
      userId: "user-1",
      email: "alice@solace.onl",
    });
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

  it("updates the authenticated user's encrypted vault backup", async () => {
    const requestBody = {
      vaultVersion: 2,
      encryptedVaultB64: "vault-b64-updated",
      kdf: "argon2id",
      kdfParams: {
        saltB64: "salt-b64",
        memoryKiB: 131072,
        iterations: 4,
        parallelism: 2,
      },
    };

    const response = await createApp().handle(
      new Request("http://localhost/mail/account/vault-backup", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockMailService.upsertVaultBackupForUser).toHaveBeenCalledWith({
      userId: "user-1",
      email: "alice@solace.onl",
      ...requestBody,
    });
    await expect(readJson(response)).resolves.toEqual({
      email: "alice@solace.onl",
      vaultVersion: 2,
      encryptedVaultB64: "vault-b64-updated",
      kdf: "argon2id",
      kdfParams: {
        saltB64: "salt-b64",
        memoryKiB: 131072,
        iterations: 4,
        parallelism: 2,
      },
    });
  });

  it("rejects unexpected fields when updating the authenticated vault backup", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/mail/account/vault-backup", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vaultVersion: 2,
          encryptedVaultB64: "vault-b64-updated",
          kdf: "argon2id",
          kdfParams: {
            saltB64: "salt-b64",
            memoryKiB: 131072,
            iterations: 4,
            parallelism: 2,
          },
          unexpected: true,
        }),
      }),
    );

    expect(response.status).toBe(422);
    expect(mockMailService.upsertVaultBackupForUser).not.toHaveBeenCalled();
    await expect(readJson(response)).resolves.toEqual(
      expect.objectContaining({
        type: "validation",
      }),
    );
  });
});
