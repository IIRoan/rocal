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

const mockBootstrapAccountMailbox = jest.mocked(
  mailDemoApiService.bootstrapAccountMailbox,
);
const mockGetSession = jest.mocked(authClient.getSession);

describe("bootstrapMailboxForAccount", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue(null as any);

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
    expect(mockBootstrapAccountMailbox).toHaveBeenCalledWith(
      expect.objectContaining({
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
    expect(mockBootstrapAccountMailbox.mock.calls[0]?.[0]).not.toHaveProperty(
      "password",
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

    expect(mockBootstrapAccountMailbox).toHaveBeenCalledTimes(2);
    expect(authClient.getSession).not.toHaveBeenCalled();
  });

  it("uses the authenticated Solace session when a user id is not supplied", async () => {
    mockGetSession.mockResolvedValueOnce({
      data: {
        user: {
          id: "user-2",
          email: "  Bob@Solace.Onl ",
          name: "  Bob Example  ",
        },
      },
    } as any);

    await expect(
      bootstrapMailboxForAccount({
        email: "pending@solace.onl",
        displayName: "Fallback Name",
        password: "StrongMailboxPassword!42",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        email: "alice@solace.onl",
        stalwartAccountId: "acct-1",
      }),
    );

    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(mailCryptoWorkerClient.generateKeyPair).toHaveBeenCalledWith({
      name: "Bob Example",
      email: "bob@solace.onl",
      privateKeyPassphrase: "StrongMailboxPassword!42",
    });
  });

  it.each([401, 403, 500, 503])(
    "retries mailbox provisioning for retryable status %i",
    async (statusCode) => {
      jest
        .mocked(mailDemoApiService.bootstrapAccountMailbox)
        .mockRejectedValueOnce({ statusCode })
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

      expect(mockBootstrapAccountMailbox).toHaveBeenCalledTimes(2);
      expect(mailCryptoWorkerClient.generateKeyPair).toHaveBeenCalledTimes(1);
      expect(createEncryptedMailVault).toHaveBeenCalledTimes(1);
      expect(putStoredMailVault).toHaveBeenCalledTimes(1);
    },
  );

  it("does not retry non-retryable provisioning errors", async () => {
    const error = { statusCode: 400, message: "Mailbox payload was invalid." };

    jest
      .mocked(mailDemoApiService.bootstrapAccountMailbox)
      .mockRejectedValueOnce(error);

    await expect(
      bootstrapMailboxForAccount({
        userId: "user-1",
        email: "alice@solace.onl",
        displayName: "Alice Example",
        password: "StrongMailboxPassword!42",
      }),
    ).rejects.toBe(error);

    expect(mockBootstrapAccountMailbox).toHaveBeenCalledTimes(1);
    expect(putStoredMailVault).not.toHaveBeenCalled();
  });

  it("throws after exhausting transient mailbox provisioning retries", async () => {
    const error = {
      statusCode: 500,
      message: "Mail API request failed with status 500.",
    };

    jest
      .mocked(mailDemoApiService.bootstrapAccountMailbox)
      .mockRejectedValue(error);

    await expect(
      bootstrapMailboxForAccount({
        userId: "user-1",
        email: "alice@solace.onl",
        displayName: "Alice Example",
        password: "StrongMailboxPassword!42",
      }),
    ).rejects.toBe(error);

    expect(mockBootstrapAccountMailbox).toHaveBeenCalledTimes(3);
    expect(mailCryptoWorkerClient.generateKeyPair).toHaveBeenCalledTimes(1);
    expect(createEncryptedMailVault).toHaveBeenCalledTimes(1);
    expect(putStoredMailVault).not.toHaveBeenCalled();
  });

  it("fails when the authenticated Solace session never becomes ready", async () => {
    await expect(
      bootstrapMailboxForAccount({
        email: "alice@solace.onl",
        displayName: "Alice Example",
        password: "StrongMailboxPassword!42",
      }),
    ).rejects.toThrow(
      "Your account was created, but the authenticated session was not ready for mailbox setup.",
    );

    expect(mockGetSession).toHaveBeenCalledTimes(5);
    expect(mockBootstrapAccountMailbox).not.toHaveBeenCalled();
    expect(putStoredMailVault).not.toHaveBeenCalled();
  });
});
