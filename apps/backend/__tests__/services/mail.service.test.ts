import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../lib/mail-key-utils", () => ({
  getOpenPgpPublicKeyFingerprint: jest.fn(async () => "ABCD1234EF567890"),
}));

process.env.MAIL_VAULT_HMAC_KEY = Buffer.from(
  "0123456789abcdef0123456789abcdef",
).toString("base64");

import { MailService } from "../../services/mail.service";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../lib/errors";
import { getOpenPgpPublicKeyFingerprint } from "../../lib/mail-key-utils";

function createMockPrisma() {
  const mockPrisma = {
    mailDirectoryEntry: {
      findUnique: jest.fn<() => Promise<any | null>>(async () => null),
      create: jest.fn(async () => ({
        id: "entry-1",
        email: "alice@solace.onl",
      })),
      update: jest.fn(async () => ({
        email: "alice@solace.onl",
        id: "entry-1",
        displayName: "Alice Example",
        stalwartAccountId: "acct-1",
        stalwartPublicKeyId: "pk-1",
        publicKeyFingerprint: "ABCD1234EF567890",
        userId: "user-1",
        vaultBackup: {
          vaultVersion: 2,
          encryptedVaultB64: "vault-b64-updated",
          kdf: "argon2id",
          kdfSaltB64: "salt-b64",
          kdfMemoryKiB: 131072,
          kdfIterations: 4,
          kdfParallelism: 2,
        },
      })),
      delete: jest.fn(async () => ({ id: "entry-1" })),
    },
    mailJmapSyncState: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    $transaction: jest.fn(async (callback: (tx: any) => Promise<any>) =>
      callback(mockPrisma),
    ),
  };

  return mockPrisma;
}

function createMockAdminClient() {
  return {
    resolveDomainByName: jest.fn(async () => ({
      id: "domain-1",
      name: "solace.onl",
    })),
    createAccount: jest.fn(async () => ({
      accountId: "acct-1",
    })),
    registerPublicKey: jest.fn(async () => ({ publicKeyId: "pk-1" })),
    enableEncryptionAtRest: jest.fn(async () => undefined),
    setAccountPassword: jest.fn(async () => undefined),
    ensureOAuthClient: jest.fn(async () => undefined),
    issueOAuthAccessToken: jest.fn(async () => ({
      access_token: "stalwart-access-token",
      expires_in: 1800,
      expires_at: 1779149999,
    })),
    deleteAccount: jest.fn(async () => undefined),
  };
}

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

describe("MailService", () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockAdminClient: ReturnType<typeof createMockAdminClient>;
  let service: MailService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockAdminClient = createMockAdminClient();
    service = new MailService(mockPrisma as any, mockAdminClient, {
      defaultDomain: "solace.onl",
      discoveryBaseUrl: "http://192.168.2.213:8080",
      oauth: mockMailOAuthConfig,
      vaultKeyMaterialEndpoint:
        "https://api.solace.test/api/mail/vault-key-material",
      stalwartOauthClientId: "solace-mail-bridge",
      stalwartOauthRedirectUri:
        "https://api.solace.test/api/mail/oauth/stalwart/callback",
    });
  });

  it("returns public configuration for the mail demo", () => {
    expect(service.getConfig()).toEqual({
      defaultDomain: "solace.onl",
      discoveryBaseUrl: "http://192.168.2.213:8080",
      signupEnabled: true,
      oauth: mockMailOAuthConfig,
      vaultKeyMaterialEndpoint:
        "https://api.solace.test/api/mail/vault-key-material",
    });
  });

  it("issues a Stalwart-local access token for a provisioned mailbox", async () => {
    mockPrisma.mailDirectoryEntry.findUnique.mockResolvedValueOnce({
      id: "entry-1",
      email: "alice@solace.onl",
      displayName: "Alice Example",
      stalwartAccountId: "acct-1",
      stalwartPublicKeyId: "pk-1",
      publicKeyFingerprint: "ABCD1234EF567890",
      userId: "user-1",
    });

    const result = await service.issueAccessTokenForUser({
      userId: "user-1",
      email: "alice@solace.onl",
    });

    expect(mockAdminClient.ensureOAuthClient).toHaveBeenCalledWith({
      clientId: "solace-mail-bridge",
      redirectUri: "https://api.solace.test/api/mail/oauth/stalwart/callback",
      description: "Solace mail backend bridge",
    });
    expect(mockAdminClient.setAccountPassword).toHaveBeenCalledWith({
      accountId: "acct-1",
      secret: expect.any(String),
    });
    expect(mockAdminClient.issueOAuthAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({
        accountName: "alice@solace.onl",
        accountSecret: expect.any(String),
        clientId: "solace-mail-bridge",
        redirectUri: "https://api.solace.test/api/mail/oauth/stalwart/callback",
        codeVerifier: expect.any(String),
        codeChallenge: expect.any(String),
      }),
    );
    expect(result).toEqual({
      access_token: "stalwart-access-token",
      expires_in: 1800,
      expires_at: 1779149999,
    });
  });

  it("returns an unprovisioned mailbox status for a new authenticated account", async () => {
    const result = await service.getMailboxStatusForUser({
      userId: "user-1",
      email: "Alice@Solace.Onl",
      displayName: "Alice Example",
    });

    expect(mockPrisma.mailDirectoryEntry.findUnique).toHaveBeenNthCalledWith(
      1,
      {
        where: { userId: "user-1" },
        select: {
          id: true,
          email: true,
          displayName: true,
          stalwartAccountId: true,
          stalwartPublicKeyId: true,
          publicKeyFingerprint: true,
          userId: true,
        },
      },
    );
    expect(mockPrisma.mailDirectoryEntry.findUnique).toHaveBeenNthCalledWith(
      2,
      {
        where: { email: "alice@solace.onl" },
        select: {
          id: true,
          email: true,
          displayName: true,
          stalwartAccountId: true,
          stalwartPublicKeyId: true,
          publicKeyFingerprint: true,
          userId: true,
        },
      },
    );
    expect(result).toEqual({
      email: "alice@solace.onl",
      displayName: "Alice Example",
      provisioned: false,
    });
  });

  it("attaches an existing mailbox record to the authenticated user when the email matches", async () => {
    mockPrisma.mailDirectoryEntry.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "entry-1",
        email: "alice@solace.onl",
        displayName: "Alice Example",
        stalwartAccountId: "acct-1",
        stalwartPublicKeyId: "pk-1",
        publicKeyFingerprint: "ABCD1234EF567890",
        userId: null,
      });
    mockPrisma.mailDirectoryEntry.update.mockResolvedValueOnce({
      id: "entry-1",
      email: "alice@solace.onl",
      displayName: "Alice Example",
      stalwartAccountId: "acct-1",
      stalwartPublicKeyId: "pk-1",
      publicKeyFingerprint: "ABCD1234EF567890",
      userId: "user-1",
      vaultBackup: {
        vaultVersion: 2,
        encryptedVaultB64: "vault-b64-updated",
        kdf: "argon2id",
        kdfSaltB64: "salt-b64",
        kdfMemoryKiB: 131072,
        kdfIterations: 4,
        kdfParallelism: 2,
      },
    });

    const result = await service.getMailboxStatusForUser({
      userId: "user-1",
      email: "Alice@Solace.Onl",
      displayName: "Alice Example",
    });

    expect(mockPrisma.mailDirectoryEntry.update).toHaveBeenCalledWith({
      where: { id: "entry-1" },
      data: {
        user: {
          connect: {
            id: "user-1",
          },
        },
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        stalwartAccountId: true,
        stalwartPublicKeyId: true,
        publicKeyFingerprint: true,
        userId: true,
      },
    });
    expect(result).toEqual({
      email: "alice@solace.onl",
      displayName: "Alice Example",
      provisioned: true,
    });
  });

  it("rejects linking a mailbox that already belongs to another Solace account", async () => {
    mockPrisma.mailDirectoryEntry.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "entry-1",
        email: "alice@solace.onl",
        displayName: "Alice Example",
        stalwartAccountId: "acct-1",
        stalwartPublicKeyId: "pk-1",
        publicKeyFingerprint: "ABCD1234EF567890",
        userId: "user-2",
      });

    await expect(
      service.getMailboxStatusForUser({
        userId: "user-1",
        email: "Alice@Solace.Onl",
        displayName: "Alice Example",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(mockPrisma.mailDirectoryEntry.update).not.toHaveBeenCalled();
  });

  it("provisions a mailbox for an authenticated Solace account and links it to the user", async () => {
    const result = await service.bootstrapForUser({
      userId: "user-1",
      email: "Alice@Solace.Onl",
      displayName: "  Alice Example  ",
      publicKeyArmored: "public-key-armored",
      fingerprint: "abcd1234ef567890",
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

    expect(mockAdminClient.resolveDomainByName).toHaveBeenCalledWith(
      "solace.onl",
    );
    expect(mockAdminClient.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        localPart: "alice",
        domainId: "domain-1",
        description: "Alice Example",
        secret: expect.any(String),
      }),
    );
    expect(mockPrisma.mailDirectoryEntry.create).toHaveBeenCalledWith({
      data: {
        email: "alice@solace.onl",
        localPart: "alice",
        domain: "solace.onl",
        displayName: "Alice Example",
        stalwartAccountId: "acct-1",
        stalwartDomainId: "domain-1",
        stalwartPublicKeyId: "pk-1",
        publicKeyArmored: "public-key-armored",
        publicKeyFingerprint: "ABCD1234EF567890",
        keyAlgorithm: "openpgp",
        source: "internal",
        trust: "verified",
        keyCreatedAt: new Date("2026-05-06T21:00:00.000Z"),
        user: {
          connect: {
            id: "user-1",
          },
        },
        vaultBackup: {
          create: {
            vaultVersion: 1,
            encryptedVaultB64: "vault-b64",
            kdf: "argon2id",
            kdfSaltB64: "salt-b64",
            kdfMemoryKiB: 65536,
            kdfIterations: 3,
            kdfParallelism: 4,
          },
        },
      },
    });
    expect(result).toEqual({
      email: "alice@solace.onl",
      displayName: "Alice Example",
      stalwartAccountId: "acct-1",
      stalwartPublicKeyId: "pk-1",
      fingerprint: "ABCD1234EF567890",
      encryptionAtRestEnabled: true,
    });
    expect(mockAdminClient.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        localPart: "alice",
        domainId: "domain-1",
        description: "Alice Example",
        secret: expect.any(String),
      }),
    );

    const createAccountCalls = mockAdminClient.createAccount.mock
      .calls as unknown as Array<[{ secret: string }]>;
    const generatedSecret = createAccountCalls[0]?.[0]?.secret;
    expect(generatedSecret).toBeTruthy();
    expect(generatedSecret?.length ?? 0).toBeGreaterThanOrEqual(60);
  });

  it("surfaces stale Stalwart mailbox conflicts without a generic 500", async () => {
    mockAdminClient.createAccount.mockRejectedValueOnce(
      new Error("Stalwart account creation failed: account already exists"),
    );

    await expect(
      service.bootstrapForUser({
        userId: "user-1",
        email: "alice@solace.onl",
        displayName: "Alice Example",
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
    ).rejects.toBeInstanceOf(ConflictError);

    expect(mockPrisma.mailDirectoryEntry.create).not.toHaveBeenCalled();
  });

  it("reuses an existing directory entry when the provisioned Stalwart account already exists", async () => {
    mockPrisma.mailDirectoryEntry.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "entry-1",
        email: "alice@solace.onl",
        userId: null,
      });

    const result = await service.bootstrapForUser({
      userId: "user-1",
      email: "alice@solace.onl",
      displayName: "Alice Example",
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

    expect(mockPrisma.mailDirectoryEntry.create).not.toHaveBeenCalled();
    expect(mockPrisma.mailJmapSyncState.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.mailDirectoryEntry.update).toHaveBeenCalledWith({
      where: { id: "entry-1" },
      data: {
        email: "alice@solace.onl",
        localPart: "alice",
        domain: "solace.onl",
        displayName: "Alice Example",
        stalwartDomainId: "domain-1",
        stalwartPublicKeyId: "pk-1",
        publicKeyArmored: "public-key-armored",
        publicKeyFingerprint: "ABCD1234EF567890",
        keyAlgorithm: "openpgp",
        source: "internal",
        trust: "verified",
        keyCreatedAt: new Date("2026-05-06T21:00:00.000Z"),
        user: {
          connect: {
            id: "user-1",
          },
        },
        vaultBackup: {
          upsert: {
            create: {
              vaultVersion: 1,
              encryptedVaultB64: "vault-b64",
              kdf: "argon2id",
              kdfSaltB64: "salt-b64",
              kdfMemoryKiB: 65536,
              kdfIterations: 3,
              kdfParallelism: 4,
            },
            update: {
              vaultVersion: 1,
              encryptedVaultB64: "vault-b64",
              kdf: "argon2id",
              kdfSaltB64: "salt-b64",
              kdfMemoryKiB: 65536,
              kdfIterations: 3,
              kdfParallelism: 4,
            },
          },
        },
      },
    });
    expect(result).toEqual({
      email: "alice@solace.onl",
      displayName: "Alice Example",
      stalwartAccountId: "acct-1",
      stalwartPublicKeyId: "pk-1",
      fingerprint: "ABCD1234EF567890",
      encryptionAtRestEnabled: true,
    });
  });

  it("repairs a stale directory entry when a reused Stalwart account id points at a different old mailbox", async () => {
    mockPrisma.mailDirectoryEntry.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "entry-stale",
        email: "1531536@solace.onl",
        userId: null,
      });

    const result = await service.bootstrapForUser({
      userId: "user-1",
      email: "testprod12@solace.onl",
      displayName: "Test Prod 12",
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

    expect(mockPrisma.mailDirectoryEntry.create).not.toHaveBeenCalled();
    expect(mockPrisma.mailJmapSyncState.deleteMany).toHaveBeenCalledWith({
      where: {
        directoryEntryId: "entry-stale",
      },
    });
    expect(mockPrisma.mailDirectoryEntry.update).toHaveBeenCalledWith({
      where: { id: "entry-stale" },
      data: {
        email: "testprod12@solace.onl",
        localPart: "testprod12",
        domain: "solace.onl",
        displayName: "Test Prod 12",
        stalwartDomainId: "domain-1",
        stalwartPublicKeyId: "pk-1",
        publicKeyArmored: "public-key-armored",
        publicKeyFingerprint: "ABCD1234EF567890",
        keyAlgorithm: "openpgp",
        source: "internal",
        trust: "verified",
        keyCreatedAt: new Date("2026-05-06T21:00:00.000Z"),
        user: {
          connect: {
            id: "user-1",
          },
        },
        vaultBackup: {
          upsert: {
            create: {
              vaultVersion: 1,
              encryptedVaultB64: "vault-b64",
              kdf: "argon2id",
              kdfSaltB64: "salt-b64",
              kdfMemoryKiB: 65536,
              kdfIterations: 3,
              kdfParallelism: 4,
            },
            update: {
              vaultVersion: 1,
              encryptedVaultB64: "vault-b64",
              kdf: "argon2id",
              kdfSaltB64: "salt-b64",
              kdfMemoryKiB: 65536,
              kdfIterations: 3,
              kdfParallelism: 4,
            },
          },
        },
      },
    });
    expect(result).toEqual({
      email: "testprod12@solace.onl",
      displayName: "Test Prod 12",
      stalwartAccountId: "acct-1",
      stalwartPublicKeyId: "pk-1",
      fingerprint: "ABCD1234EF567890",
      encryptionAtRestEnabled: true,
    });
  });

  it("rejects stale-entry repair when the reused mailbox is already linked to another Solace account", async () => {
    mockPrisma.mailDirectoryEntry.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "entry-stale",
        email: "1531536@solace.onl",
        userId: "user-old",
      });

    await expect(
      service.bootstrapForUser({
        userId: "user-1",
        email: "testprod12@solace.onl",
        displayName: "Test Prod 12",
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
    ).rejects.toBeInstanceOf(ValidationError);

    expect(mockPrisma.mailJmapSyncState.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.mailDirectoryEntry.update).not.toHaveBeenCalled();
  });

  it("rejects bootstrapping when the authenticated user already has a linked mailbox", async () => {
    mockPrisma.mailDirectoryEntry.findUnique.mockResolvedValueOnce({
      id: "entry-1",
      email: "alice@solace.onl",
      displayName: "Alice Example",
      stalwartAccountId: "acct-1",
      stalwartPublicKeyId: "pk-1",
      publicKeyFingerprint: "ABCD1234EF567890",
      userId: "user-1",
    });

    await expect(
      service.bootstrapForUser({
        userId: "user-1",
        email: "alice@solace.onl",
        displayName: "Alice Example",
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
    ).rejects.toBeInstanceOf(ValidationError);

    expect(mockAdminClient.createAccount).not.toHaveBeenCalled();
    expect(mockPrisma.mailDirectoryEntry.create).not.toHaveBeenCalled();
  });

  it("rejects a mismatched fingerprint before provisioning the account", async () => {
    jest
      .mocked(getOpenPgpPublicKeyFingerprint)
      .mockResolvedValueOnce("DIFFERENTFINGERPRINT");

    await expect(
      service.bootstrapForUser({
        userId: "user-1",
        email: "alice@solace.onl",
        displayName: "Alice Example",
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
    ).rejects.toBeInstanceOf(ValidationError);

    expect(mockAdminClient.createAccount).not.toHaveBeenCalled();
    expect(mockPrisma.mailDirectoryEntry.create).not.toHaveBeenCalled();
  });

  it("returns a public key directory entry for internal encrypted sends", async () => {
    mockPrisma.mailDirectoryEntry.findUnique.mockResolvedValueOnce({
      email: "bob@solace.onl",
      publicKeyArmored: "recipient-public-key",
      publicKeyFingerprint: "FACECAFE12345678",
      source: "internal",
      trust: "verified",
    });

    const result = await service.getDirectoryKey("  Bob@Solace.Onl  ");

    expect(mockPrisma.mailDirectoryEntry.findUnique).toHaveBeenCalledWith({
      where: { email: "bob@solace.onl" },
      select: {
        email: true,
        publicKeyArmored: true,
        publicKeyFingerprint: true,
        source: true,
        trust: true,
      },
    });
    expect(result).toEqual({
      email: "bob@solace.onl",
      publicKeyArmored: "recipient-public-key",
      fingerprint: "FACECAFE12345678",
      source: "internal",
      trust: "verified",
    });
  });

  it("upserts encrypted vault backups without touching plaintext material", async () => {
    const result = await service.upsertVaultBackup({
      email: "  Alice@Solace.Onl  ",
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

    expect(mockPrisma.mailDirectoryEntry.update).toHaveBeenCalledWith({
      where: { email: "alice@solace.onl" },
      data: {
        vaultBackup: {
          upsert: {
            create: {
              vaultVersion: 2,
              encryptedVaultB64: "vault-b64-updated",
              kdf: "argon2id",
              kdfSaltB64: "salt-b64",
              kdfMemoryKiB: 131072,
              kdfIterations: 4,
              kdfParallelism: 2,
            },
            update: {
              vaultVersion: 2,
              encryptedVaultB64: "vault-b64-updated",
              kdf: "argon2id",
              kdfSaltB64: "salt-b64",
              kdfMemoryKiB: 131072,
              kdfIterations: 4,
              kdfParallelism: 2,
            },
          },
        },
      },
      select: {
        email: true,
        vaultBackup: {
          select: {
            vaultVersion: true,
            encryptedVaultB64: true,
            kdf: true,
            kdfSaltB64: true,
            kdfMemoryKiB: true,
            kdfIterations: true,
            kdfParallelism: true,
          },
        },
      },
    });
    expect(result).toEqual({
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

  it("throws when a vault backup is requested for an unknown mailbox", async () => {
    await expect(
      service.getVaultBackup("missing@solace.onl"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("deletes the linked Stalwart account and directory entry for a user", async () => {
    mockPrisma.mailDirectoryEntry.findUnique.mockResolvedValueOnce({
      id: "entry-1",
      email: "alice@solace.onl",
      stalwartAccountId: "acct-1",
    });

    await service.deleteMailboxForUser({ userId: "user-1" });

    expect(mockAdminClient.deleteAccount).toHaveBeenCalledWith("acct-1");
    expect(mockPrisma.mailDirectoryEntry.delete).toHaveBeenCalledWith({
      where: { id: "entry-1" },
    });
  });

  it("no-ops mailbox deletion when the user has no linked mailbox", async () => {
    mockPrisma.mailDirectoryEntry.findUnique.mockResolvedValueOnce(null);

    await service.deleteMailboxForUser({ userId: "user-1" });

    expect(mockAdminClient.deleteAccount).not.toHaveBeenCalled();
    expect(mockPrisma.mailDirectoryEntry.delete).not.toHaveBeenCalled();
  });

  it("cleans up orphaned Stalwart accounts when directory persistence fails", async () => {
    mockPrisma.mailDirectoryEntry.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockPrisma.mailDirectoryEntry.create.mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    await expect(
      service.bootstrapForUser({
        userId: "user-1",
        email: "alice@solace.onl",
        displayName: "Alice Example",
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
    ).rejects.toThrow("Mailbox directory persistence failed");

    expect(mockAdminClient.deleteAccount).toHaveBeenCalledWith("acct-1");
  });
});
