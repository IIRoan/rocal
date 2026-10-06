import * as openpgp from "openpgp";
import { deriveVaultKeyB64 } from "../lib/mail/vault-kdf";
import {
  containsArmoredPgpMessage,
  MAX_PGP_DECRYPT_LAYERS,
  mergeSignatureVerificationState,
  resolveLayerSignatureVerificationState,
} from "@workspace/calendar-core/mail-pgp-layers";
import type {
  MailDecryptResult,
  MailSignatureVerificationState,
  MailVaultKdfParams,
} from "../lib/mail/types";

let activePrivateKey: openpgp.PrivateKey | null = null;

async function handleGenerateKeyPair(payload: {
  name: string;
  email: string;
  privateKeyPassphrase: string;
}) {
  const { privateKey, publicKey, revocationCertificate } =
    await openpgp.generateKey({
      type: "ecc",
      curve: "curve25519Legacy",
      userIDs: [{ name: payload.name, email: payload.email }],
      passphrase: payload.privateKeyPassphrase,
    });

  const fingerprint = (await openpgp.readKey({ armoredKey: publicKey }))
    .getFingerprint()
    .toUpperCase();

  return {
    publicKeyArmored: publicKey,
    privateKeyArmored: privateKey,
    revocationCertificate,
    fingerprint,
  };
}

async function handleReEncryptPrivateKey(payload: {
  privateKeyArmored: string;
  oldPassphrase: string;
  newPassphrase: string;
}): Promise<{ privateKeyArmored: string }> {
  const decrypted = await openpgp.decryptKey({
    privateKey: await openpgp.readPrivateKey({
      armoredKey: payload.privateKeyArmored,
    }),
    passphrase: payload.oldPassphrase,
  });
  const reEncrypted = await openpgp.encryptKey({
    privateKey: decrypted,
    passphrase: payload.newPassphrase,
  });
  return { privateKeyArmored: reEncrypted.armor() };
}

async function handleLoadActiveVault(payload: {
  privateKeyArmored: string;
  privateKeyPassphrase: string;
  publicKeyArmored: string;
}) {
  activePrivateKey = await openpgp.decryptKey({
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

  return { fingerprint };
}

async function handleDecryptMessage(payload: {
  armoredMessage: string;
  senderPublicKeyArmored?: string;
}) {
  if (!activePrivateKey) {
    throw new Error("Mail vault is not loaded on this device.");
  }

  const verificationKeys = payload.senderPublicKeyArmored
    ? await openpgp.readKey({ armoredKey: payload.senderPublicKeyArmored })
    : undefined;

  let armoredMessage = payload.armoredMessage.trim();
  let plaintext = "";
  let signatureVerificationState: MailSignatureVerificationState = "not_signed";

  for (let layer = 0; layer < MAX_PGP_DECRYPT_LAYERS; layer++) {
    if (!containsArmoredPgpMessage(armoredMessage)) {
      plaintext = armoredMessage;
      break;
    }

    const message = await openpgp.readMessage({ armoredMessage });
    const decrypted = await openpgp.decrypt({
      message,
      decryptionKeys: activePrivateKey,
      verificationKeys,
    });

    plaintext =
      typeof decrypted.data === "string"
        ? decrypted.data
        : new TextDecoder().decode(decrypted.data as Uint8Array);

    const layerSignatureState = await resolveLayerSignatureVerificationState({
      signatures: decrypted.signatures,
      hasVerificationKey: Boolean(verificationKeys),
    });
    signatureVerificationState = mergeSignatureVerificationState(
      signatureVerificationState,
      layerSignatureState,
    );

    if (!containsArmoredPgpMessage(plaintext)) {
      break;
    }

    armoredMessage = plaintext.trim();
  }

  if (!plaintext) {
    throw new Error("PGP decryption did not return any plaintext.");
  }

  return {
    plaintext,
    hasVerifiedSignature: signatureVerificationState === "verified",
    signatureVerificationState,
  } satisfies MailDecryptResult;
}

async function handleEncryptForRecipients(payload: {
  plaintext: string;
  recipientPublicKeysArmored: string[];
}) {
  if (!activePrivateKey) {
    throw new Error("Mail vault is not loaded on this device.");
  }

  const encryptionKeys = await Promise.all(
    payload.recipientPublicKeysArmored.map((armoredKey) =>
      openpgp.readKey({ armoredKey }),
    ),
  );
  const armoredMessage = await openpgp.encrypt({
    message: await openpgp.createMessage({ text: payload.plaintext }),
    encryptionKeys,
    signingKeys: activePrivateKey,
  });

  return { armoredMessage };
}

function clearActiveVault() {
  activePrivateKey = null;
  return { cleared: true };
}

async function handleDeriveVaultKey(payload: {
  password: string;
  kdfParams: MailVaultKdfParams;
}) {
  const keyB64 = await deriveVaultKeyB64(payload.password, payload.kdfParams);
  return { keyB64 };
}

type MailCryptoWorkerRequest =
  | {
      requestId: number;
      type: "GENERATE_PGP_KEYPAIR";
      payload: Parameters<typeof handleGenerateKeyPair>[0];
    }
  | {
      requestId: number;
      type: "REENCRYPT_PRIVATE_KEY";
      payload: Parameters<typeof handleReEncryptPrivateKey>[0];
    }
  | {
      requestId: number;
      type: "LOAD_ACTIVE_VAULT";
      payload: Parameters<typeof handleLoadActiveVault>[0];
    }
  | {
      requestId: number;
      type: "DECRYPT_PGP_MESSAGE";
      payload: Parameters<typeof handleDecryptMessage>[0];
    }
  | {
      requestId: number;
      type: "ENCRYPT_FOR_RECIPIENTS";
      payload: Parameters<typeof handleEncryptForRecipients>[0];
    }
  | { requestId: number; type: "CLEAR_ACTIVE_VAULT" }
  | {
      requestId: number;
      type: "DERIVE_VAULT_KEY";
      payload: Parameters<typeof handleDeriveVaultKey>[0];
    };

self.onmessage = async (event: MessageEvent<MailCryptoWorkerRequest>) => {
  const request = event.data;
  const commandType = request.type;

  try {
    let result: unknown;

    switch (request.type) {
      case "GENERATE_PGP_KEYPAIR":
        result = await handleGenerateKeyPair(request.payload);
        break;
      case "REENCRYPT_PRIVATE_KEY":
        result = await handleReEncryptPrivateKey(request.payload);
        break;
      case "LOAD_ACTIVE_VAULT":
        result = await handleLoadActiveVault(request.payload);
        break;
      case "DECRYPT_PGP_MESSAGE":
        result = await handleDecryptMessage(request.payload);
        break;
      case "ENCRYPT_FOR_RECIPIENTS":
        result = await handleEncryptForRecipients(request.payload);
        break;
      case "CLEAR_ACTIVE_VAULT":
        result = clearActiveVault();
        break;
      case "DERIVE_VAULT_KEY":
        result = await handleDeriveVaultKey(request.payload);
        break;
      default:
        throw new Error(`Unknown mail crypto worker command: ${commandType}`);
    }

    self.postMessage({
      requestId: request.requestId,
      type: `${request.type}_RESULT`,
      payload: result,
    });
  } catch (error) {
    self.postMessage({
      requestId: request.requestId,
      error: error instanceof Error ? error.message : "Unknown worker error",
    });
  }
};

export {};
