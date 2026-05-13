import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../lib/auth-client", () => ({
  authClient: {
    getSession: jest.fn(),
  },
}));

jest.mock("../../lib/mail/api-service", () => ({
  mailDemoApiService: {
    bootstrapAccountMailbox: jest.fn(),
  },
}));

jest.mock("../../lib/mail/vault-crypto", () => ({
  createEncryptedMailVault: jest.fn(),
}));

jest.mock("../../lib/mail/vault-storage", () => ({
  putStoredMailVault: jest.fn(),
}));

jest.mock("../../lib/mail/worker-client", () => ({
  mailCryptoWorkerClient: {
    generateKeyPair: jest.fn(),
  },
}));

import { authClient } from "../../lib/auth-client";
import { bootstrapMailboxForAccount } from "../../lib/mail/account-bootstrap";
import { mailDemoApiService } from "../../lib/mail/api-service";
import { createEncryptedMailVault } from "../../lib/mail/vault-crypto";
import { putStoredMailVault } from "../../lib/mail/vault-storage";
import { mailCryptoWorkerClient } from "../../lib/mail/worker-client";

describe("bootstrapMailboxForAccount", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    jest.mocked(mailCryptoWorkerClient.generateKeyPair).mockResolvedValue({
      publicKeyArmored: "public-key-armored",
      privateKeyArmored: "private-key-armored",
      fingerprint: "ABCD1234EF567890",
      revocationCertificate: "revocation-certificate",
    });
    jest.mocked(createEncryptedMailVault).mockResolvedValue({
      encryptedVaultB64: "encrypted-vault-b64",
      kdf: "argon2id",
      kdfParams: {
        saltB64: "salt-b64",
        memoryKiB: 65536,
        iterations: 3,
        parallelism: 4,
      },
    });
    jest.mocked(mailDemoApiService.bootstrapAccountMailbox).mockResolvedValue({
      email: "alice@solace.onl",
      displayName: "Alice Example",
      stalwartAccountId: "acct-1",
      stalwartPublicKeyId: "pk-1",
      fingerprint: "ABCD1234EF567890",
      encryptionAtRestEnabled: true,
    });
    jest.mocked(putStoredMailVault).mockResolvedValue(undefined);
  });

  it("generates keys, encrypts the vault, provisions the mailbox, and stores a local backup", async () => {
    const result = await bootstrapMailboxForAccount({
      userId: "user-1",
      email: "Alice@Solace.Onl",
      displayName: "  Alice Example  ",
      password: "StrongMailboxPassword!42",
    });

    expect(mailCryptoWorkerClient.generateKeyPair).toHaveBeenCalledWith({
      name: "Alice Example",
      email: "alice@solace.onl",
      privateKeyPassphrase: "StrongMailboxPassword!42",
    });
    expect(createEncryptedMailVault).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        email: "alice@solace.onl",
        publicKeyArmored: "public-key-armored",
        publicKeyFingerprint: "ABCD1234EF567890",
        encryptedPrivateKeyArmored: "private-key-armored",
        kdf: "argon2id",
        vaultVersion: 1,
      }),
      "StrongMailboxPassword!42",
    );
    expect(mailDemoApiService.bootstrapAccountMailbox).toHaveBeenCalledWith(
      expect.objectContaining({
        password: "StrongMailboxPassword!42",
        publicKeyArmored: "public-key-armored",
        fingerprint: "ABCD1234EF567890",
        algorithm: "openpgp",
        vaultVersion: 1,
        encryptedVaultB64: "encrypted-vault-b64",
        kdf: "argon2id",
        kdfParams: {
          saltB64: "salt-b64",
          memoryKiB: 65536,
          iterations: 3,
          parallelism: 4,
        },
      }),
    );
    expect(putStoredMailVault).toHaveBeenCalledWith({
      email: "alice@solace.onl",
      vaultVersion: 1,
      encryptedVaultB64: "encrypted-vault-b64",
      kdf: "argon2id",
      kdfParams: {
        saltB64: "salt-b64",
        memoryKiB: 65536,
        iterations: 3,
        parallelism: 4,
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

  it("retries mailbox provisioning when the authenticated session is still settling", async () => {
    jest
      .mocked(mailDemoApiService.bootstrapAccountMailbox)
      .mockRejectedValueOnce({ statusCode: 401 })
      .mockResolvedValueOnce({
        email: "alice@solace.onl",
        displayName: "Alice Example",
        stalwartAccountId: "acct-1",
        stalwartPublicKeyId: "pk-1",
        fingerprint: "ABCD1234EF567890",
        encryptionAtRestEnabled: true,
      });

    await expect(
      bootstrapMailboxForAccount({
        userId: "user-1",
        email: "alice@solace.onl",
        displayName: "Alice Example",
        password: "StrongMailboxPassword!42",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        email: "alice@solace.onl",
        stalwartAccountId: "acct-1",
      }),
    );

    expect(mailDemoApiService.bootstrapAccountMailbox).toHaveBeenCalledTimes(2);
    expect(authClient.getSession).not.toHaveBeenCalled();
  });
});
