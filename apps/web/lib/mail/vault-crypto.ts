import type {
  EncryptedMailVaultRecord,
  MailVaultKdfParams,
  UserKeyVault,
} from "./types";

const DEFAULT_VAULT_MEMORY_KIB = 65536;
const DEFAULT_VAULT_ITERATIONS = 3;
const DEFAULT_VAULT_PARALLELISM = 4;

type VaultEnvelope = {
  version: 1;
  algorithm: "AES-GCM-256";
  ivB64: string;
  ciphertextB64: string;
};

function getCryptoRef(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto is required for the mail vault.");
  }

  return globalThis.crypto;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }

  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  return Uint8Array.from(Buffer.from(value, "base64"));
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function decodeUtf8(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}

function toBufferSource(value: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(value.byteLength);
  new Uint8Array(buffer).set(value);
  return buffer;
}

async function deriveVaultKey(
  passphrase: string,
  params: MailVaultKdfParams,
): Promise<CryptoKey> {
  let keyBytes: Uint8Array;

  if (typeof Worker !== "undefined") {
    const { mailCryptoWorkerClient } = await import("./worker-client");
    const { keyB64 } = await mailCryptoWorkerClient.deriveVaultKey({
      password: passphrase,
      kdfParams: params,
    });
    keyBytes = base64ToBytes(keyB64);
  } else {
    const { deriveVaultKeyBytes } = await import("./vault-kdf");
    keyBytes = await deriveVaultKeyBytes(passphrase, params);
  }

  return getCryptoRef().subtle.importKey(
    "raw",
    toBufferSource(keyBytes),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

function createKdfParams(
  overrides?: Partial<MailVaultKdfParams>,
): MailVaultKdfParams {
  const cryptoRef = getCryptoRef();
  const salt = new Uint8Array(16);
  cryptoRef.getRandomValues(salt);

  return {
    saltB64: overrides?.saltB64 || bytesToBase64(salt),
    memoryKiB: overrides?.memoryKiB ?? DEFAULT_VAULT_MEMORY_KIB,
    iterations: overrides?.iterations ?? DEFAULT_VAULT_ITERATIONS,
    parallelism: overrides?.parallelism ?? DEFAULT_VAULT_PARALLELISM,
  };
}

export async function createEncryptedMailVault(
  vault: UserKeyVault,
  passphrase: string,
  overrides?: Partial<MailVaultKdfParams>,
): Promise<EncryptedMailVaultRecord> {
  const cryptoRef = getCryptoRef();
  const kdfParams = createKdfParams(overrides);
  const persistedVault: UserKeyVault = {
    ...vault,
    kdf: "argon2id",
    kdfParams,
  };
  const key = await deriveVaultKey(passphrase, kdfParams);
  const iv = new Uint8Array(12);
  cryptoRef.getRandomValues(iv);
  const ciphertext = await cryptoRef.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    toBufferSource(encodeUtf8(JSON.stringify(persistedVault))),
  );
  const envelope: VaultEnvelope = {
    version: 1,
    algorithm: "AES-GCM-256",
    ivB64: bytesToBase64(iv),
    ciphertextB64: bytesToBase64(new Uint8Array(ciphertext)),
  };

  return {
    encryptedVaultB64: bytesToBase64(encodeUtf8(JSON.stringify(envelope))),
    kdf: "argon2id",
    kdfParams,
  };
}

export async function unlockEncryptedMailVault(
  encryptedVaultB64: string,
  passphrase: string,
  kdfParams: MailVaultKdfParams,
): Promise<UserKeyVault> {
  try {
    const cryptoRef = getCryptoRef();
    const envelope = JSON.parse(
      decodeUtf8(base64ToBytes(encryptedVaultB64)),
    ) as VaultEnvelope;
    const key = await deriveVaultKey(passphrase, kdfParams);
    const plaintext = await cryptoRef.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toBufferSource(base64ToBytes(envelope.ivB64)),
      },
      key,
      toBufferSource(base64ToBytes(envelope.ciphertextB64)),
    );

    return JSON.parse(decodeUtf8(new Uint8Array(plaintext))) as UserKeyVault;
  } catch {
    throw new Error("Failed to decrypt mail vault");
  }
}
