import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../lib/mail-key-utils", () => ({
  getOpenPgpPublicKeyFingerprint: jest.fn(async () => "ABCD1234EF567890"),
}));

import { MailService } from "../../services/mail.service";
import { NotFoundError, ValidationError } from "../../lib/errors";
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
  };
}

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
    });
  });

  it("returns public configuration for the mail demo", () => {
    expect(service.getConfig()).toEqual({
      defaultDomain: "solace.onl",
      discoveryBaseUrl: "http://192.168.2.213:8080",
      signupEnabled: true,
      loginMode: "basic",
    });
  });

  it("returns an unprovisioned mailbox status for a new authenticated account", async () => {
    const result = await service.getMailboxStatusForUser({
      userId: "user-1",
      email: "Alice@Solace.Onl",
      displayName: "Alice Example",
    });

    expect(mockPrisma.mailDirectoryEntry.findUnique).toHaveBeenNthCalledWith(1, {
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
    });
    expect(mockPrisma.mailDirectoryEntry.findUnique).toHaveBeenNthCalledWith(2, {
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
    });
    expect(result).toEqual({
      email: "alice@solace.onl",
      displayName: "Alice Example",
      provisioned: false,
    });
  });

  it("provisions a new encrypted mailbox and stores the directory entry", async () => {
    const result = await service.signUp({
      displayName: "  Alice Example  ",
      localPart: "  Alice  ",
      password: "StrongMailboxPassword!42",
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

    expect(getOpenPgpPublicKeyFingerprint).toHaveBeenCalledWith(
      "public-key-armored",
    );
    expect(mockAdminClient.resolveDomainByName).toHaveBeenCalledWith(
      "solace.onl",
    );
    expect(mockAdminClient.createAccount).toHaveBeenCalledWith({
      localPart: "alice",
      password: "StrongMailboxPassword!42",
      domainId: "domain-1",
      description: "Alice Example",
    });
    expect(mockAdminClient.registerPublicKey).toHaveBeenCalledWith({
      accountId: "acct-1",
      email: "alice@solace.onl",
      publicKeyArmored: "public-key-armored",
      description: "Alice Example primary OpenPGP key",
    });
    expect(mockAdminClient.enableEncryptionAtRest).toHaveBeenCalledWith({
      accountId: "acct-1",
      publicKeyId: "pk-1",
      encryptOnAppend: false,
      allowSpamTraining: false,
    });
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
  });

  it("provisions a mailbox for an authenticated Solace account and links it to the user", async () => {
    const result = await service.bootstrapForUser({
      userId: "user-1",
      email: "Alice@Solace.Onl",
      displayName: "  Alice Example  ",
      password: "StrongMailboxPassword!42",
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
  });

  it("rejects a mismatched fingerprint before provisioning the account", async () => {
    jest
      .mocked(getOpenPgpPublicKeyFingerprint)
      .mockResolvedValueOnce("DIFFERENTFINGERPRINT");

    await expect(
      service.signUp({
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
});