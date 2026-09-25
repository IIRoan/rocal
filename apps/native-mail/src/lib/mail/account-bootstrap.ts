import * as openpgp from "openpgp";
import { createLogger } from "@workspace/logger";
import {
  bootstrapAccountMailbox,
  getMailAccountStatus,
  getMailConfig,
} from "./mail-api";
import {
  createEncryptedMailVault,
  type UserKeyVault,
} from "./native-vault-crypto";
import {
  generateVaultSecret,
  VAULT_WRAP_ALGORITHM,
  wrapVaultSecret,
} from "./vault-secret";
import type { MailSignupResponse } from "./types";

const log = createLogger("native:mail-bootstrap");

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
  const [config, status] = await Promise.all([
    getMailConfig(),
    getMailAccountStatus(),
  ]);

  if (status.provisioned) {
    throw new Error("This account already has a mailbox.");
  }

  if (!config.signupEnabled) {
    throw new Error("Mailbox setup is not enabled for this environment.");
  }

  const vaultSecret = generateVaultSecret();
  const wrappedSecret = await wrapVaultSecret(vaultSecret);
  if (!wrappedSecret) {
    throw new Error(
      "Mailbox setup needs your encryption keys unlocked on this device. Sign in again, then retry.",
    );
  }

  const createdAt = new Date().toISOString();
  const generated = await generateMailboxKeyPair({
    email,
    displayName,
    passphrase: vaultSecret,
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

  const encryptedVault = await createEncryptedMailVault(vault, vaultSecret);

  return bootstrapAccountMailbox({
    publicKeyArmored: generated.publicKeyArmored,
    fingerprint: generated.fingerprint,
    algorithm: "openpgp",
    createdAt,
    vaultVersion: 1,
    encryptedVaultB64: encryptedVault.encryptedVaultB64,
    kdf: encryptedVault.kdf,
    kdfParams: encryptedVault.kdfParams,
    wrappedSecret,
    wrapAlgorithm: VAULT_WRAP_ALGORITHM,
  });
}
