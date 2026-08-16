/**
 * Native-compatible mail vault crypto.
 *
 * Prefers `react-native-quick-crypto` (native Argon2id + WebCrypto AES-GCM)
 * now that the app ships as a development/production client. Jest and any
 * runtime without those native modules fall back to `@noble/hashes/argon2`
 * and `node-forge`, which stay byte-compatible with the web vault format.
 */
import { argon2id as nobleArgon2id } from "@noble/hashes/argon2.js";
import * as ExpoCrypto from "expo-crypto";
import forge from "node-forge";
import { createLogger } from "@workspace/logger";
import { loadQuickCrypto } from "../load-quick-crypto";
import type { MailVaultKdfParams } from "./types";

const JS_SAFE_ARGON2_MEMORY_KIB = 8192;
const JS_SAFE_ARGON2_ITERATIONS = 1;
const JS_SAFE_ARGON2_PARALLELISM = 1;
const NATIVE_SAFE_ARGON2_MEMORY_KIB = 65536;
const NATIVE_SAFE_ARGON2_ITERATIONS = 3;
const NATIVE_SAFE_ARGON2_PARALLELISM = 4;

const log = createLogger("native:vault-crypto");

// ---------------------------------------------------------------------------
// Shared types (mirrors web's vault-crypto types)
// ---------------------------------------------------------------------------

export type LabelDef = {
  id: string;
  name: string;
  color: string;
};

export type UserKeyVault = {
  userId: string;
  email: string;
  publicKeyArmored: string;
  publicKeyFingerprint: string;
  /** Armored PGP private key, itself protected by the original passphrase. */
  encryptedPrivateKeyArmored: string;
  kdf: string;
  kdfParams: MailVaultKdfParams;
  vaultVersion: number;
  createdAt: string;
  /** User-defined mail labels — synced across web and native via the vault backup. */
  labels?: LabelDef[];
};

type VaultEnvelope = {
  version: 1;
  algorithm: "AES-GCM-256";
  ivB64: string;
  ciphertextB64: string;
};

// ---------------------------------------------------------------------------
// Binary helpers (avoid Buffer.from where possible for Hermes compat)
// ---------------------------------------------------------------------------

function base64ToBytes(value: string): Uint8Array {
  // Accept both standard base64 and base64url encodings
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded =
    base64.length % 4 === 0 ? base64 : base64 + "=".repeat(4 - (base64.length % 4));
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Converts a Uint8Array to a node-forge binary string (Latin-1 encoded,
 * one char per byte).
 */
function toForgeBinary(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return binary;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function toUint8Array(value: Uint8Array | ArrayBuffer): Uint8Array {
  return value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value);
}

function asArrayBufferView(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes as Uint8Array<ArrayBuffer>;
}

function fillRandomBytes(bytes: Uint8Array): Uint8Array {
  const view = asArrayBufferView(bytes);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(view);
    return bytes;
  }
  ExpoCrypto.getRandomValues(view);
  return bytes;
}

export function hasNativeArgon2(): boolean {
  return typeof loadQuickCrypto()?.argon2Sync === "function";
}

export function isArgon2SafeToRunLocally(
  params: MailVaultKdfParams,
  nativeArgon2 = hasNativeArgon2(),
): boolean {
  if (nativeArgon2) {
    return (
      params.memoryKiB <= NATIVE_SAFE_ARGON2_MEMORY_KIB &&
      params.iterations <= NATIVE_SAFE_ARGON2_ITERATIONS &&
      params.parallelism <= NATIVE_SAFE_ARGON2_PARALLELISM
    );
  }

  return (
    params.memoryKiB <= JS_SAFE_ARGON2_MEMORY_KIB &&
    params.iterations <= JS_SAFE_ARGON2_ITERATIONS &&
    params.parallelism <= JS_SAFE_ARGON2_PARALLELISM
  );
}

export function tryNativeArgon2id(
  passwordBytes: Uint8Array,
  saltBytes: Uint8Array,
  params: MailVaultKdfParams,
): Uint8Array | null {
  const argon2Sync = loadQuickCrypto()?.argon2Sync;
  if (typeof argon2Sync !== "function") {
    return null;
  }

  try {
    const derived = argon2Sync("argon2id", {
      message: passwordBytes,
      nonce: saltBytes,
      parallelism: params.parallelism,
      tagLength: 32,
      memory: params.memoryKiB,
      passes: params.iterations,
    });
    const bytes = toUint8Array(derived);
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

export function deriveArgon2id(
  passwordBytes: Uint8Array,
  saltBytes: Uint8Array,
  params: MailVaultKdfParams,
): Uint8Array {
  return (
    tryNativeArgon2id(passwordBytes, saltBytes, params) ??
    nobleArgon2id(passwordBytes, saltBytes, {
      m: params.memoryKiB,
      t: params.iterations,
      p: params.parallelism,
      dkLen: 32,
    })
  );
}

// ---------------------------------------------------------------------------
// Key derivation — native Argon2id when linked, noble otherwise
// ---------------------------------------------------------------------------

/**
 * Derives a 32-byte AES-GCM key from the given passphrase and KDF params
 * using argon2id. Output is byte-for-byte identical to the web vault-crypto
 * module for the same inputs.
 */
async function deriveVaultKeyBytes(
  passphrase: string,
  params: MailVaultKdfParams,
): Promise<Uint8Array> {
  log.debug("[vault-crypto] deriveVaultKeyBytes: starting argon2id derivation", {
    memoryKiB: params.memoryKiB,
    iterations: params.iterations,
    parallelism: params.parallelism,
    saltLength: params.saltB64.length,
    native: hasNativeArgon2(),
  });

  const derived = deriveArgon2id(
    encodeUtf8(passphrase),
    base64ToBytes(params.saltB64),
    params,
  );

  log.debug("[vault-crypto] deriveVaultKeyBytes: argon2id derivation complete, dkLen=32");
  return derived;
}

// ---------------------------------------------------------------------------
// AES-GCM via WebCrypto, with node-forge fallback
// ---------------------------------------------------------------------------

function forgeAesGcmDecrypt(
  keyBinary: string,
  ivBytes: Uint8Array,
  ciphertextWithTag: Uint8Array,
): string {
  const tagLengthBytes = 16; // 128-bit GCM authentication tag
  if (ciphertextWithTag.length < tagLengthBytes) {
    throw new Error("Ciphertext too short to contain AES-GCM tag.");
  }

  const ciphertext = ciphertextWithTag.slice(0, -tagLengthBytes);
  const tag = ciphertextWithTag.slice(-tagLengthBytes);

  const decipher = forge.cipher.createDecipher("AES-GCM", keyBinary);
  decipher.start({
    iv: forge.util.createBuffer(toForgeBinary(ivBytes)),
    tag: forge.util.createBuffer(toForgeBinary(tag)),
    tagLength: 128,
  });
  decipher.update(forge.util.createBuffer(toForgeBinary(ciphertext)));

  if (!decipher.finish()) {
    throw new Error(
      "AES-GCM decryption failed: authentication tag mismatch. " +
      "The passphrase or ciphertext is incorrect.",
    );
  }

  return decipher.output.toString();
}

function forgeAesGcmEncrypt(
  keyBinary: string,
  ivBytes: Uint8Array,
  plaintextBinary: string,
): Uint8Array {
  const cipher = forge.cipher.createCipher("AES-GCM", keyBinary);
  cipher.start({ iv: forge.util.createBuffer(toForgeBinary(ivBytes)), tagLength: 128 });
  cipher.update(forge.util.createBuffer(plaintextBinary));

  if (!cipher.finish()) {
    throw new Error("AES-GCM encryption failed.");
  }

  const ciphertextBinary = cipher.output.getBytes();
  const tagBinary = (cipher.mode as { tag: { getBytes: () => string } }).tag.getBytes();
  const combined = new Uint8Array(ciphertextBinary.length + tagBinary.length);
  for (let i = 0; i < ciphertextBinary.length; i++) {
    combined[i] = ciphertextBinary.charCodeAt(i);
  }
  for (let i = 0; i < tagBinary.length; i++) {
    combined[ciphertextBinary.length + i] = tagBinary.charCodeAt(i);
  }
  return combined;
}

export async function aesGcmDecrypt(
  keyBytes: Uint8Array,
  ivBytes: Uint8Array,
  ciphertextWithTag: Uint8Array,
): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const key = await subtle.importKey(
      "raw",
      toArrayBuffer(keyBytes),
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );
    const plaintext = await subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(ivBytes), tagLength: 128 },
      key,
      toArrayBuffer(ciphertextWithTag),
    );
    return decodeUtf8(new Uint8Array(plaintext));
  }

  return forgeAesGcmDecrypt(toForgeBinary(keyBytes), ivBytes, ciphertextWithTag);
}

export async function aesGcmEncrypt(
  keyBytes: Uint8Array,
  ivBytes: Uint8Array,
  plaintextBytes: Uint8Array,
): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const key = await subtle.importKey(
      "raw",
      toArrayBuffer(keyBytes),
      { name: "AES-GCM" },
      false,
      ["encrypt"],
    );
    const ciphertext = await subtle.encrypt(
      { name: "AES-GCM", iv: toArrayBuffer(ivBytes), tagLength: 128 },
      key,
      toArrayBuffer(plaintextBytes),
    );
    return new Uint8Array(ciphertext);
  }

  return forgeAesGcmEncrypt(
    toForgeBinary(keyBytes),
    ivBytes,
    toForgeBinary(plaintextBytes),
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Unlocks an AES-GCM encrypted mail vault using a pre-computed AES-GCM key.
 *
 * Used by the native app when the backend returns the argon2id-derived key
 * directly (bypassing the expensive argon2id derivation on the JS thread).
 *
 * @param encryptedVaultB64 - Base64-encoded JSON envelope from the vault backup
 * @param derivedKeyBase64  - 32-byte AES-GCM key as base64url (from backend)
 */
export async function unlockEncryptedMailVaultWithDerivedKey(
  encryptedVaultB64: string,
  derivedKeyBase64: string,
): Promise<UserKeyVault> {
  log.debug("[vault-crypto] unlockEncryptedMailVaultWithDerivedKey: starting", {
    vaultDataLength: encryptedVaultB64.length,
  });

  try {
    const envelopeJson = decodeUtf8(base64ToBytes(encryptedVaultB64));
    const envelope = JSON.parse(envelopeJson) as VaultEnvelope;

    if (envelope.version !== 1) {
      throw new Error(`Unsupported vault envelope version: ${envelope.version}`);
    }
    if (envelope.algorithm !== "AES-GCM-256") {
      throw new Error(`Unsupported vault algorithm: ${envelope.algorithm}`);
    }

    const keyBytes = base64ToBytes(derivedKeyBase64);
    const ivBytes = base64ToBytes(envelope.ivB64);
    const ciphertextWithTag = base64ToBytes(envelope.ciphertextB64);

    log.debug("[vault-crypto] unlockEncryptedMailVaultWithDerivedKey: decrypting AES-GCM", {
      keyLength: keyBytes.length,
      ivLength: ivBytes.length,
      ciphertextLength: ciphertextWithTag.length,
    });

    const plaintextBinary = await aesGcmDecrypt(keyBytes, ivBytes, ciphertextWithTag);
    const vault = JSON.parse(plaintextBinary) as UserKeyVault;

    log.debug("[vault-crypto] unlockEncryptedMailVaultWithDerivedKey: SUCCESS, email=%s", vault.email);
    return vault;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.debug("[vault-crypto] unlockEncryptedMailVaultWithDerivedKey: FAILED — %s", msg);
    throw new Error(`Failed to decrypt mail vault with derived key: ${msg}`);
  }
}

/**
 * Drop-in replacement for the web's `unlockEncryptedMailVault` from
 * `vault-crypto.ts`, but using pure-JS crypto that works in Hermes.
 */
export async function unlockEncryptedMailVault(
  encryptedVaultB64: string,
  passphrase: string,
  kdfParams: MailVaultKdfParams,
): Promise<UserKeyVault> {
  log.debug("[vault-crypto] unlockEncryptedMailVault: starting", {
    kdf: "argon2id",
    vaultDataLength: encryptedVaultB64.length,
  });

  try {
    // 1. Parse the outer envelope
    const envelopeJson = decodeUtf8(base64ToBytes(encryptedVaultB64));
    log.debug("[vault-crypto] unlockEncryptedMailVault: parsed outer base64 envelope");
    const envelope = JSON.parse(envelopeJson) as VaultEnvelope;

    if (envelope.version !== 1) {
      throw new Error(`Unsupported vault envelope version: ${envelope.version}`);
    }
    if (envelope.algorithm !== "AES-GCM-256") {
      throw new Error(`Unsupported vault algorithm: ${envelope.algorithm}`);
    }

    log.debug("[vault-crypto] unlockEncryptedMailVault: envelope version=1, algorithm=AES-GCM-256, deriving key...");

    // 2. Derive the AES-GCM key from the passphrase using pure-JS argon2id
    const keyBytes = await deriveVaultKeyBytes(passphrase, kdfParams);

    // 3. Decode IV and ciphertext
    const ivBytes = base64ToBytes(envelope.ivB64);
    const ciphertextWithTag = base64ToBytes(envelope.ciphertextB64);

    log.debug("[vault-crypto] unlockEncryptedMailVault: decrypting AES-GCM", {
      ivLength: ivBytes.length,
      ciphertextLength: ciphertextWithTag.length,
    });

    const plaintextBinary = await aesGcmDecrypt(keyBytes, ivBytes, ciphertextWithTag);
    const vault = JSON.parse(plaintextBinary) as UserKeyVault;

    log.debug("[vault-crypto] unlockEncryptedMailVault: SUCCESS, email=%s vaultVersion=%d",
      vault.email, vault.vaultVersion);
    return vault;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.debug("[vault-crypto] unlockEncryptedMailVault: FAILED — %s", msg);
    throw new Error(`Failed to decrypt mail vault: ${msg}`);
  }
}

/**
 * Creates an AES-GCM encrypted mail vault sealed with argon2id.
 *
 * Byte-for-byte compatible with the web's `createEncryptedMailVault`.
 * Primarily used in tests and future native-side provisioning flows.
 */
export async function createEncryptedMailVault(
  vault: UserKeyVault,
  passphrase: string,
  overrides?: Partial<MailVaultKdfParams>,
): Promise<{
  encryptedVaultB64: string;
  kdf: "argon2id";
  kdfParams: MailVaultKdfParams;
}> {
  const kdfParams: MailVaultKdfParams = {
    saltB64: overrides?.saltB64 ?? generateSalt(),
    memoryKiB: overrides?.memoryKiB ?? 65536,
    iterations: overrides?.iterations ?? 3,
    parallelism: overrides?.parallelism ?? 4,
  };

  const keyBytes = await deriveVaultKeyBytes(passphrase, kdfParams);

  const ivBytes = fillRandomBytes(new Uint8Array(12));

  const persistedVault: UserKeyVault = { ...vault, kdf: "argon2id", kdfParams };
  const plaintextBytes = encodeUtf8(JSON.stringify(persistedVault));

  const ciphertextWithTag = await aesGcmEncrypt(keyBytes, ivBytes, plaintextBytes);

  const envelope: VaultEnvelope = {
    version: 1,
    algorithm: "AES-GCM-256",
    ivB64: bytesToBase64(ivBytes),
    ciphertextB64: bytesToBase64(ciphertextWithTag),
  };

  const encryptedVaultB64 = bytesToBase64(encodeUtf8(JSON.stringify(envelope)));

  return { encryptedVaultB64, kdf: "argon2id", kdfParams };
}

function generateSalt(): string {
  return bytesToBase64(fillRandomBytes(new Uint8Array(16)));
}
