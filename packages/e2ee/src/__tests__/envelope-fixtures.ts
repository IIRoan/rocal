import { createHash, webcrypto } from "node:crypto";
import type { CryptoProvider } from "../crypto-provider";
import {
  bytesToBase64Url,
  createE2eeModule,
  type Argon2idDerive,
  type PasswordEnvelopeInput,
} from "../e2ee-module";

// Node's WebCrypto matches the provider at runtime; only the DOM-shaped declarations differ.
export const nodeCrypto = webcrypto as unknown as CryptoProvider;

/** A fast keyed stand-in for Argon2id, so round-trip tests do not spend 64 MiB per run. */
export const stubArgon2id: Argon2idDerive = async (password, salt, params) =>
  new Uint8Array(
    createHash("sha256")
      .update(password)
      .update(salt)
      .update(`${params.memoryKiB}:${params.passes}:${params.parallelism}`)
      .digest(),
  );

export const testE2eeModule = createE2eeModule(nodeCrypto, { argon2id: stubArgon2id });

/** An envelope as clients before Argon2id wrote it, so the PBKDF2 reader stays covered. */
export async function pbkdf2Envelope(input: {
  password: string;
  accountKey: CryptoKey;
  blindIndexKey: CryptoKey;
  kdfIterations: number;
}): Promise<PasswordEnvelopeInput & { kdfAlgorithm: string }> {
  const kdfSalt = testE2eeModule.generatePasswordSalt();
  const passwordKey = await nodeCrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(input.password.normalize("NFKC")),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  const salt = Buffer.from(kdfSalt, "base64url");
  const wrappingKey = await nodeCrypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: input.kdfIterations, hash: "SHA-256" },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const wrap = async (key: CryptoKey, aad: string) => {
    const iv = nodeCrypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await nodeCrypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
      wrappingKey,
      await nodeCrypto.subtle.exportKey("raw", key),
    );
    return JSON.stringify({
      version: 1,
      algorithm: "AES-GCM",
      iv: bytesToBase64Url(iv),
      ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    });
  };
  return {
    kdfAlgorithm: "PBKDF2-SHA-256",
    kdfSalt,
    kdfIterations: input.kdfIterations,
    wrappedAccountKey: await wrap(input.accountKey, "account-key:1"),
    wrappedSearchKey: await wrap(input.blindIndexKey, "blind-index-key:1"),
    keyVersion: 1,
  };
}
