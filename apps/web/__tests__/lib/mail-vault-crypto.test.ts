import { describe, expect, it } from "@jest/globals";

import {
  createEncryptedMailVault,
  unlockEncryptedMailVault,
  unlockEncryptedMailVaultWithDerivedKey,
} from "../../lib/mail/vault-crypto";
import { deriveVaultKeyBytes } from "../../lib/mail/vault-kdf";

const sampleVault = {
  userId: "mail-user-1",
  email: "alice@solace.onl",
  publicKeyArmored: "public-key-armored",
  publicKeyFingerprint: "ABCD1234EF567890",
  encryptedPrivateKeyArmored: "private-key-armored",
  kdf: "argon2id" as const,
  kdfParams: {
    saltB64: "",
    memoryKiB: 8192,
    iterations: 2,
    parallelism: 1,
  },
  vaultVersion: 1,
  createdAt: "2026-05-06T21:00:00.000Z",
};

describe("mail vault crypto", () => {
  it("round-trips a client vault with Argon2id and AES-GCM", async () => {
    const encrypted = await createEncryptedMailVault(
      sampleVault,
      "correct horse battery staple",
      {
        memoryKiB: 8192,
        iterations: 2,
        parallelism: 1,
      },
    );

    const unlocked = await unlockEncryptedMailVault(
      encrypted.encryptedVaultB64,
      "correct horse battery staple",
      encrypted.kdfParams,
    );

    expect(unlocked).toEqual(
      expect.objectContaining({
        email: "alice@solace.onl",
        encryptedPrivateKeyArmored: "private-key-armored",
        publicKeyFingerprint: "ABCD1234EF567890",
      }),
    );
    expect(encrypted.kdf).toBe("argon2id");
  });

  it("unlocks with a pre-derived AES key without re-running argon2", async () => {
    const passphrase = "correct horse battery staple";
    const encrypted = await createEncryptedMailVault(sampleVault, passphrase, {
      memoryKiB: 8192,
      iterations: 2,
      parallelism: 1,
    });
    const keyBytes = await deriveVaultKeyBytes(passphrase, encrypted.kdfParams);
    const derivedKeyB64 = Buffer.from(keyBytes)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    await expect(
      unlockEncryptedMailVaultWithDerivedKey(
        encrypted.encryptedVaultB64,
        derivedKeyB64,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        email: "alice@solace.onl",
        encryptedPrivateKeyArmored: "private-key-armored",
      }),
    );
  });

  it("rejects invalid vault passwords", async () => {
    const encrypted = await createEncryptedMailVault(
      sampleVault,
      "correct horse battery staple",
      {
        memoryKiB: 8192,
        iterations: 2,
        parallelism: 1,
      },
    );

    await expect(
      unlockEncryptedMailVault(
        encrypted.encryptedVaultB64,
        "wrong password",
        encrypted.kdfParams,
      ),
    ).rejects.toThrow("Failed to decrypt mail vault");
  });
});
