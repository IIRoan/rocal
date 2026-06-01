import * as openpgp from "openpgp";
import { createLogger } from "@workspace/logger";
import {
  bootstrapAccountMailbox,
  getMailAccountStatus,
  getMailConfig,
  getVaultKeyMaterial,
} from "./mail-api";
import {
  createEncryptedMailVault,
  type UserKeyVault,
} from "./native-vault-crypto";
import { loadMailVaultPassword } from "./mail-password-cache";
import type {
  MailSignupResponse,
  MailVaultKdfParams,
} from "./types";

const log = createLogger("native:mail-bootstrap");

const KEY_MATERIAL_KDF: Partial<MailVaultKdfParams> = {
  memoryKiB: 8192,
  iterations: 1,
  parallelism: 1,
};

function normalizeOptionalText(value?: string | null): string | null {
  const normalized = value?.trim() || "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

async function generateMailboxKeyPair(input: {
  email: string;
  displayName?: string | null;
  passphrase: string;
}) {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy" as never,
    userIDs: [
      {
        name: input.displayName || input.email,
        email: input.email,
      },
    ],
    passphrase: input.passphrase,
  });

  const fingerprint = (await openpgp.readKey({ armoredKey: publicKey }))
    .getFingerprint()
    .toUpperCase();

  return {
    privateKeyArmored: privateKey,
    publicKeyArmored: publicKey,
    fingerprint,
  };
}

export async function bootstrapMailboxForAccount(input: {
  userId: string;
  email: string;
  displayName?: string | null;
}): Promise<MailSignupResponse> {
  const email = normalizeEmail(input.email);
  const displayName = normalizeOptionalText(input.displayName);
  const [config, status, storedPassword] = await Promise.all([
    getMailConfig(),
    getMailAccountStatus(),
    loadMailVaultPassword(),
  ]);

  if (status.provisioned) {
    throw new Error("This account already has a mailbox.");
  }

  if (!config.signupEnabled) {
    throw new Error("Mailbox setup is not enabled for this environment.");
  }

  let keyMaterial: string | null = null;
  try {
    keyMaterial = (
      await getVaultKeyMaterial(config.vaultKeyMaterialEndpoint)
    ).keyMaterial;
  } catch (error) {
    log.warn(
      "Could not fetch vault key material during native mailbox bootstrap",
      {
        error,
      },
    );
  }

  const vaultPassphrase = keyMaterial ?? storedPassword;
  if (!vaultPassphrase) {
    throw new Error(
      "Mailbox setup needs either server vault key material or your saved sign-in password. Sign out and sign back in with your email password once, then try again.",
    );
  }

  const createdAt = new Date().toISOString();
  const generated = await generateMailboxKeyPair({
    email,
    displayName,
    passphrase: vaultPassphrase,
  });

  const vault: UserKeyVault = {
    userId: input.userId,
    email,
    publicKeyArmored: generated.publicKeyArmored,
    publicKeyFingerprint: generated.fingerprint,
    encryptedPrivateKeyArmored: generated.privateKeyArmored,
    kdf: "argon2id",
    kdfParams: {
      saltB64: "",
      memoryKiB: 65536,
      iterations: 3,
      parallelism: 4,
    },
    vaultVersion: 1,
    createdAt,
  };

  const encryptedVault = await createEncryptedMailVault(
    vault,
    vaultPassphrase,
    keyMaterial ? KEY_MATERIAL_KDF : undefined,
  );

  return bootstrapAccountMailbox({
    publicKeyArmored: generated.publicKeyArmored,
    fingerprint: generated.fingerprint,
    algorithm: "openpgp",
    createdAt,
    vaultVersion: 1,
    encryptedVaultB64: encryptedVault.encryptedVaultB64,
    kdf: encryptedVault.kdf,
    kdfParams: encryptedVault.kdfParams,
  });
}
