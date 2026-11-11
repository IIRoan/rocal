import {
  inspectMailPublicKey,
  MAIL_PGP_KEY_GENERATION_PROFILE,
} from "@workspace/calendar-core/mail-pgp-key-inspection";
import * as openpgp from "openpgp";
import { deriveVaultKeyB64 } from "../lib/mail/vault-kdf";
import {
  decryptPgpMessageLayers,
  MAX_PGP_DECRYPT_BYTES,
} from "@workspace/calendar-core/mail-pgp-layers";
import { extractNestedPgpMimeCiphertext } from "../lib/mail/decrypted-mail-content";
import type { MailDecryptResult, MailVaultKdfParams } from "../lib/mail/types";

import {
  clearActiveMailVault,
  encryptForRecipients,
  getActiveMailPrivateKey,
  loadActiveMailVault,
} from "../lib/mail/mail-encryption-engine";

async function handleGenerateKeyPair(payload: {
  name: string;
  email: string;
  privateKeyPassphrase: string;
}) {
  const { privateKey, publicKey, revocationCertificate } =
    await openpgp.generateKey({
      ...MAIL_PGP_KEY_GENERATION_PROFILE,
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

async function handleDecryptMessage(payload: {
  armoredMessage: string;
  senderPublicKeyArmored?: string;
  expectedVaultFingerprint?: string;
}) {
  const activePrivateKey = getActiveMailPrivateKey();
  if (!activePrivateKey) {
    throw new Error("Mail vault is not loaded on this device.");
  }

  if (
    payload.expectedVaultFingerprint &&
    activePrivateKey.getFingerprint().toUpperCase() !==
      payload.expectedVaultFingerprint.toUpperCase()
  ) {
    throw new Error("Mail encryption session changed.");
  }
  const verificationKeys = payload.senderPublicKeyArmored
    ? await openpgp.readKey({ armoredKey: payload.senderPublicKeyArmored })
    : undefined;

  const result = (await decryptPgpMessageLayers({
    armoredMessage: payload.armoredMessage,
    extractMimeCiphertext: extractNestedPgpMimeCiphertext,
    decryptLayer: async (armoredMessage) => {
      const decrypted = await openpgp.decrypt({
        message: await openpgp.readMessage({
          armoredMessage,
          config: { maxDecompressedMessageSize: MAX_PGP_DECRYPT_BYTES },
        }),
        decryptionKeys: activePrivateKey,
        verificationKeys,
        config: { maxDecompressedMessageSize: MAX_PGP_DECRYPT_BYTES },
      });
      return {
        plaintext:
          typeof decrypted.data === "string"
            ? decrypted.data
            : new TextDecoder().decode(decrypted.data),
        signatures: decrypted.signatures,
        hasVerificationKey: Boolean(verificationKeys),
      };
    },
  })) satisfies MailDecryptResult;
  if (getActiveMailPrivateKey() !== activePrivateKey)
    throw new Error("Mail encryption session changed.");
  return result;
}

async function handleDeriveVaultKey(payload: {
  password: string;
  kdfParams: MailVaultKdfParams;
}) {
  const keyB64 = await deriveVaultKeyB64(payload.password, payload.kdfParams);
  return { keyB64 };
}

async function handleInspectPublicKey(payload: {
  armoredKey: string;
  knownArmoredKey?: string;
  forEncryption: boolean;
}) {
  return inspectMailPublicKey(payload, openpgp);
}

type MailCryptoWorkerRequest =
  | {
      requestId: number;
      type: "INSPECT_PUBLIC_KEY";
      payload: Parameters<typeof handleInspectPublicKey>[0];
    }
  | {
      requestId: number;
      type: "GENERATE_PGP_KEYPAIR";
      payload: Parameters<typeof handleGenerateKeyPair>[0];
    }
  | {
      requestId: number;
      type: "LOAD_ACTIVE_VAULT";
      payload: Parameters<typeof loadActiveMailVault>[0];
    }
  | {
      requestId: number;
      type: "DECRYPT_PGP_MESSAGE";
      payload: Parameters<typeof handleDecryptMessage>[0];
    }
  | {
      requestId: number;
      type: "ENCRYPT_FOR_RECIPIENTS";
      payload: Parameters<typeof encryptForRecipients>[0];
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
      case "INSPECT_PUBLIC_KEY":
        result = await handleInspectPublicKey(request.payload);
        break;
      case "GENERATE_PGP_KEYPAIR":
        result = await handleGenerateKeyPair(request.payload);
        break;
      case "LOAD_ACTIVE_VAULT":
        result = await loadActiveMailVault(request.payload);
        break;
      case "DECRYPT_PGP_MESSAGE":
        result = await handleDecryptMessage(request.payload);
        break;
      case "ENCRYPT_FOR_RECIPIENTS":
        result = await encryptForRecipients(request.payload);
        break;
      case "CLEAR_ACTIVE_VAULT":
        result = clearActiveMailVault();
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
