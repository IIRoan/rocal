/**
 * Native-compatible mail vault crypto.
 *
 * The web app uses `hash-wasm`'s argon2id implementation which requires
 * WebAssembly. Hermes (React Native's JS engine) does NOT support WASM,
 * so we replace it with `@noble/hashes/argon2` — a pure TypeScript/JS
 * implementation with zero WASM dependencies.
 *
 * AES-GCM encryption/decryption falls back to `node-forge` (already a
 * dependency for the E2EE module) rather than Web Crypto API, ensuring
 * the code works regardless of whether `globalThis.crypto.subtle` is
 * available.
 */
import { argon2id as nobleArgon2id } from "@noble/hashes/argon2.js";
import forge from "node-forge";
import { createLogger } from "@workspace/logger";
import type { MailVaultKdfParams } from "./types";

const log = createLogger("native:vault-crypto");

// ---------------------------------------------------------------------------
// Shared types (mirrors web's vault-crypto types)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Key derivation — pure-JS argon2id (no WASM)
// ---------------------------------------------------------------------------

/**
 * Derives a 32-byte AES-GCM key from the given passphrase and KDF params
 * using argon2id. Returns the raw key bytes as a node-forge binary string.
 *
 * This is the pure-JS equivalent of hash-wasm's argon2id call in the web
 * vault-crypto module. The output is byte-for-byte identical for the same
 * inputs — existing vaults created by the web app can be unlocked here.
 */
async function deriveVaultKeyBytes(
  passphrase: string,
  params: MailVaultKdfParams,
): Promise<string> {
  log.debug("[vault-crypto] deriveVaultKeyBytes: starting argon2id derivation", {
    memoryKiB: params.memoryKiB,
    iterations: params.iterations,
    parallelism: params.parallelism,
    saltLength: params.saltB64.length,
  });

  const passwordBytes = encodeUtf8(passphrase);
  const saltBytes = base64ToBytes(params.saltB64);

  // @noble/hashes/argon2 is pure JS — no WASM, works on Hermes
  const derived = nobleArgon2id(passwordBytes, saltBytes, {
    m: params.memoryKiB,
    t: params.iterations,
    p: params.parallelism,
    dkLen: 32,
  });

  log.debug("[vault-crypto] deriveVaultKeyBytes: argon2id derivation complete, dkLen=32");
  return toForgeBinary(derived);
}

// ---------------------------------------------------------------------------
// AES-GCM via node-forge
// ---------------------------------------------------------------------------

/**
 * Decrypts an AES-GCM ciphertext using node-forge.
 * The `ciphertextWithTag` is expected to be `ciphertext || authTag` where
 * the tag is the last 16 bytes (128-bit) — matching Web Crypto API's format.
 */
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

/**
 * Encrypts plaintext using AES-GCM via node-forge.
 * Returns `ciphertext || authTag` (last 16 bytes are the tag).
 */
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
  const tagBinary = (cipher.mode as any).tag.getBytes() as string;
  const combined = new Uint8Array(ciphertextBinary.length + tagBinary.length);
  for (let i = 0; i < ciphertextBinary.length; i++) {
    combined[i] = ciphertextBinary.charCodeAt(i);
  }
  for (let i = 0; i < tagBinary.length; i++) {
    combined[ciphertextBinary.length + i] = tagBinary.charCodeAt(i);
  }
  return combined;
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
    const keyBinary = toForgeBinary(keyBytes);
    const ivBytes = base64ToBytes(envelope.ivB64);
    const ciphertextWithTag = base64ToBytes(envelope.ciphertextB64);

    log.debug("[vault-crypto] unlockEncryptedMailVaultWithDerivedKey: decrypting AES-GCM", {
      keyLength: keyBytes.length,
      ivLength: ivBytes.length,
      ciphertextLength: ciphertextWithTag.length,
    });

    const plaintextBinary = forgeAesGcmDecrypt(keyBinary, ivBytes, ciphertextWithTag);
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
    const keyBinary = await deriveVaultKeyBytes(passphrase, kdfParams);

    // 3. Decode IV and ciphertext
    const ivBytes = base64ToBytes(envelope.ivB64);
    const ciphertextWithTag = base64ToBytes(envelope.ciphertextB64);

    log.debug("[vault-crypto] unlockEncryptedMailVault: decrypting AES-GCM", {
      ivLength: ivBytes.length,
      ciphertextLength: ciphertextWithTag.length,
    });

    // 4. Decrypt with node-forge AES-GCM
    const plaintextBinary = forgeAesGcmDecrypt(keyBinary, ivBytes, ciphertextWithTag);
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

  const keyBinary = await deriveVaultKeyBytes(passphrase, kdfParams);

  const ivBytes = new Uint8Array(12);
  // Use crypto.getRandomValues if available, else generate deterministically
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(ivBytes);
  } else {
    for (let i = 0; i < ivBytes.length; i++) {
      ivBytes[i] = Math.floor(Math.random() * 256);
    }
  }

  const persistedVault: UserKeyVault = { ...vault, kdf: "argon2id", kdfParams };
  const plaintextBinary = encodeUtf8(JSON.stringify(persistedVault));

  const ciphertextWithTag = forgeAesGcmEncrypt(
    keyBinary,
    ivBytes,
    toForgeBinary(plaintextBinary),
  );

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
  const salt = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(salt);
  } else {
    for (let i = 0; i < salt.length; i++) {
      salt[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytesToBase64(salt);
}
