import { afterEach, describe, expect, it, jest } from "@jest/globals";
import * as openpgp from "openpgp";
import {
  invalidFixtureEnvelopes,
  mailVaultFixtures,
  readFixtureEnvelope,
} from "../../../../packages/calendar-core/src/__tests__/fixtures/mail-vault-fixtures";
import { clearActiveE2eeSession, setActiveE2eeSession } from "@/lib/e2ee-session";
import { unwrapVaultSecret } from "@/lib/mail/vault-secret";

jest.mock("@/lib/e2ee-bootstrap", () => ({ waitForPendingE2eeBootstrap: () => null }));

import {
  createEncryptedMailVault,
  unlockEncryptedMailVault,
  unlockEncryptedMailVaultWithDerivedKey,
} from "../../lib/mail/vault-crypto";
import { deriveVaultKeyBytes } from "../../lib/mail/vault-kdf";

afterEach(() => clearActiveE2eeSession());

describe.each(mailVaultFixtures.fixtures)("committed $id vault", (fixture) => {
  it("opens the actual producer's envelope and validates its wire framing", async () => {
    const envelope = readFixtureEnvelope(fixture.encryptedVaultB64);
    expect(Buffer.from(envelope.ivB64, "base64")).toHaveLength(12);
    expect(Buffer.from(envelope.ciphertextB64, "base64").length).toBeGreaterThan(16);
    await expect(unlockEncryptedMailVault(fixture.encryptedVaultB64, fixture.passphrase, fixture.kdfParams)).resolves.toEqual(fixture.expectedVault);
  });

  it("matches the independent Node/OpenSSL Argon2id known answer", async () => {
    const key = await deriveVaultKeyBytes(fixture.passphrase, fixture.kdfParams);
    expect(Buffer.from(key).toString("hex")).toBe(fixture.expectedKeyHex);
  });

  it("unwraps the account secret, opens the vault and decrypts its signed message", async () => {
    const accountKey = await crypto.subtle.importKey("raw", new Uint8Array(Buffer.from(mailVaultFixtures.accountKeyB64, "base64")), "AES-GCM", false, ["decrypt"]);
    setActiveE2eeSession({ userId: fixture.expectedVault.userId, deviceId: "synthetic-device", accountKey, blindIndexKey: accountKey, activatedAt: new Date() });
    const secret = await unwrapVaultSecret(fixture.wrappedSecret);
    if (!secret) throw new Error("Fixture account secret did not open");
    const vault = await unlockEncryptedMailVault(fixture.encryptedVaultB64, secret, fixture.kdfParams);
    const privateKey = await openpgp.decryptKey({ privateKey: await openpgp.readPrivateKey({ armoredKey: vault.encryptedPrivateKeyArmored }), passphrase: secret });
    const publicKey = await openpgp.readKey({ armoredKey: vault.publicKeyArmored });
    expect(publicKey.getFingerprint()).toBe(vault.publicKeyFingerprint);
    const decrypted = await openpgp.decrypt({ message: await openpgp.readMessage({ armoredMessage: fixture.armoredMessage }), decryptionKeys: privateKey, verificationKeys: publicKey, format: "utf8" });
    expect(decrypted.data).toBe(fixture.plaintext);
    expect(decrypted.signatures).toHaveLength(1);
    await expect(decrypted.signatures[0]?.verified).resolves.toBe(true);
  });

  it("rejects a wrong passphrase", async () => {
    await expect(unlockEncryptedMailVault(fixture.encryptedVaultB64, `${fixture.passphrase}-wrong`, fixture.kdfParams)).rejects.toThrow("Failed to decrypt mail vault");
  });

  it.each(invalidFixtureEnvelopes(fixture.encryptedVaultB64))("rejects $name", async ({ value }) => {
    await expect(unlockEncryptedMailVault(value, fixture.passphrase, fixture.kdfParams)).rejects.toThrow("Failed to decrypt mail vault");
  });
});

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
