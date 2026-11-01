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
    const derivedKey = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(keyBytes),
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );

    await expect(
      unlockEncryptedMailVaultWithDerivedKey(
        encrypted.encryptedVaultB64,
        derivedKey,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        email: "alice@solace.onl",
        encryptedPrivateKeyArmored: "private-key-armored",
      }),
    );
  });

  it("hands the derived key to the cache only as a non-extractable key", async () => {
    const passphrase = "correct horse battery staple";
    const encrypted = await createEncryptedMailVault(sampleVault, passphrase, {
      memoryKiB: 8192,
      iterations: 2,
      parallelism: 1,
    });
    const cached: CryptoKey[] = [];

    await unlockEncryptedMailVault(
      encrypted.encryptedVaultB64,
      passphrase,
      encrypted.kdfParams,
      (key) => cached.push(key),
    );

    expect(cached).toHaveLength(1);
    expect(cached[0]?.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", cached[0] as CryptoKey)).rejects.toThrow();
    await expect(
      unlockEncryptedMailVaultWithDerivedKey(encrypted.encryptedVaultB64, cached[0] as CryptoKey),
    ).resolves.toEqual(expect.objectContaining({ email: "alice@solace.onl" }));
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
