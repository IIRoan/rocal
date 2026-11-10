import * as openpgp from "openpgp";
import {
  encryptMailForRecipients,
  type MailRecipientEncryptionInput,
} from "@workspace/calendar-core/mail-pgp-encryption";

let activePrivateKey: openpgp.PrivateKey | null = null;
let vaultGeneration = 0;

export async function loadActiveMailVault(payload: {
  privateKeyArmored: string;
  privateKeyPassphrase: string;
  publicKeyArmored: string;
}) {
  const generation = ++vaultGeneration;
  activePrivateKey = null;
  const privateKey = await openpgp.decryptKey({
    privateKey: await openpgp.readPrivateKey({
      armoredKey: payload.privateKeyArmored,
    }),
    passphrase: payload.privateKeyPassphrase,
  });

  const fingerprint = (
    await openpgp.readKey({ armoredKey: payload.publicKeyArmored })
  )
    .getFingerprint()
    .toUpperCase();

  if (privateKey.getFingerprint().toUpperCase() !== fingerprint) {
    throw new Error("Mail vault public and private keys do not match.");
  }
  if (generation !== vaultGeneration) {
    throw new Error("Mail encryption session changed. Please try again.");
  }
  activePrivateKey = privateKey;
  return { fingerprint };
}

export function encryptForRecipients(payload: MailRecipientEncryptionInput) {
  const signingKey = activePrivateKey;
  const generation = vaultGeneration;
  if (!signingKey) {
    throw new Error("Mail vault is not loaded on this device.");
  }
  return encryptMailForRecipients(
    payload,
    {
      signingKey,
      isCurrent: () => generation === vaultGeneration,
    },
    openpgp,
  );
}

export function clearActiveMailVault() {
  vaultGeneration += 1;
  activePrivateKey = null;
  return { cleared: true };
}

export function getActiveMailPrivateKey(): openpgp.PrivateKey | null {
  return activePrivateKey;
}
