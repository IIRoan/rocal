import * as openpgp from "openpgp";

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

  const fingerprint = (
    await openpgp.readKey({ armoredKey: publicKey })
  ).getFingerprint().toUpperCase();

  return {
    publicKeyArmored: publicKey,
    privateKeyArmored: privateKey,
    revocationCertificate,
    fingerprint,
  };
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
  ).getFingerprint().toUpperCase();

  return { fingerprint };
}

async function handleDecryptMessage(payload: {
  armoredMessage: string;
  senderPublicKeyArmored?: string;
}) {
  if (!activePrivateKey) {
    throw new Error("Mail vault is not loaded on this device.");
  }

  const message = await openpgp.readMessage({
    armoredMessage: payload.armoredMessage,
  });
  const verificationKeys = payload.senderPublicKeyArmored
    ? await openpgp.readKey({ armoredKey: payload.senderPublicKeyArmored })
    : undefined;
  const decrypted = await openpgp.decrypt({
    message,
    decryptionKeys: activePrivateKey,
    verificationKeys,
  });

  let hasVerifiedSignature = false;

  if (Array.isArray(decrypted.signatures) && decrypted.signatures.length > 0) {
    try {
      await Promise.all(decrypted.signatures.map((signature) => signature.verified));
      hasVerifiedSignature = true;
    } catch {
      hasVerifiedSignature = false;
    }
  }

  return {
    plaintext:
      typeof decrypted.data === "string"
        ? decrypted.data
        : new TextDecoder().decode(decrypted.data as Uint8Array),
    hasVerifiedSignature,
  };
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

self.onmessage = async (event: MessageEvent) => {
  const { requestId, type, payload } = event.data as {
    requestId: number;
    type: string;
    payload?: any;
  };

  try {
    let result: unknown;

    switch (type) {
      case "GENERATE_PGP_KEYPAIR":
        result = await handleGenerateKeyPair(payload);
        break;
      case "LOAD_ACTIVE_VAULT":
        result = await handleLoadActiveVault(payload);
        break;
      case "DECRYPT_PGP_MESSAGE":
        result = await handleDecryptMessage(payload);
        break;
      case "ENCRYPT_FOR_RECIPIENTS":
        result = await handleEncryptForRecipients(payload);
        break;
      case "CLEAR_ACTIVE_VAULT":
        result = clearActiveVault();
        break;
      default:
        throw new Error(`Unknown mail crypto worker command: ${type}`);
    }

    self.postMessage({
      requestId,
      type: `${type}_RESULT`,
      payload: result,
    });
  } catch (error) {
    self.postMessage({
      requestId,
      error: error instanceof Error ? error.message : "Unknown worker error",
    });
  }
};

export {};