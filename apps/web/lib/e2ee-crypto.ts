const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const RSA_WRAP_ALGORITHM: RsaHashedKeyGenParams = {
  name: "RSA-OAEP",
  modulusLength: 4096,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

const AES_GCM_ALGORITHM = { name: "AES-GCM", length: 256 } as const;
const PBKDF2_ALGORITHM = { name: "PBKDF2" } as const;
const HMAC_ALGORITHM = {
  name: "HMAC",
  hash: "SHA-256",
  length: 256,
} as const;

const GCM_IV_BYTES = 12;
const MAX_BLIND_INDEX_TOKENS = 24;
const PASSWORD_SALT_BYTES = 16;

export const PASSWORD_KDF_ALGORITHM = "PBKDF2-SHA-256";
export const PASSWORD_WRAP_ALGORITHM = "AES-GCM-256";
export const DEFAULT_PASSWORD_KDF_ITERATIONS = 310000;

export interface EncryptedJsonPayload {
  version: number;
  algorithm: "AES-GCM";
  iv: string;
  ciphertext: string;
}

export interface EncryptedBinaryPayload {
  version: number;
  algorithm: "AES-GCM";
  iv: string;
  ciphertext: string;
}

export interface PasswordEnvelopePayload {
  kdfAlgorithm: string;
  kdfSalt: string;
  kdfIterations: number;
  wrappedAccountKey: string;
  wrappedSearchKey: string;
  wrapAlgorithm: string;
  keyVersion: number;
}

export function isWebCryptoAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.crypto !== "undefined" &&
    typeof window.crypto.subtle !== "undefined"
  );
}

export function generateDeviceId(): string {
  return crypto.randomUUID();
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function parseEncryptedBinaryPayload(value: string): EncryptedBinaryPayload {
  const parsed = JSON.parse(value) as Partial<EncryptedBinaryPayload>;

  if (
    parsed.algorithm !== "AES-GCM" ||
    typeof parsed.iv !== "string" ||
    typeof parsed.ciphertext !== "string"
  ) {
    throw new Error("Invalid encrypted key payload");
  }

  return {
    version: parsed.version ?? 1,
    algorithm: "AES-GCM",
    iv: parsed.iv,
    ciphertext: parsed.ciphertext,
  };
}

function normalizeBlindIndexText(value: string): string[] {
  const normalized = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return [];
  }

  return Array.from(
    new Set(
      normalized
        .split(" ")
        .map((token) => token.trim())
        .filter((token) => token.length >= 2),
    ),
  ).slice(0, MAX_BLIND_INDEX_TOKENS);
}

export async function generateWrappingKeyPair(): Promise<CryptoKeyPair> {
  return (await crypto.subtle.generateKey(RSA_WRAP_ALGORITHM, false, [
    "wrapKey",
    "unwrapKey",
  ])) as CryptoKeyPair;
}

export async function exportWrappingPublicKey(publicKey: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey("spki", publicKey);
  return bytesToBase64Url(new Uint8Array(spki));
}

export async function generateAccountKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(AES_GCM_ALGORITHM, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function generateBlindIndexKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(HMAC_ALGORITHM, true, ["sign"]);
}

export async function wrapSymmetricKey(
  key: CryptoKey,
  publicKey: CryptoKey,
): Promise<string> {
  const wrapped = await crypto.subtle.wrapKey("raw", key, publicKey, {
    name: "RSA-OAEP",
  });
  return bytesToBase64Url(new Uint8Array(wrapped));
}

export function generatePasswordSalt(): string {
  return bytesToBase64Url(
    crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES)),
  );
}

export async function derivePasswordWrappingKey(
  password: string,
  salt: string,
  iterations: number = DEFAULT_PASSWORD_KDF_ITERATIONS,
): Promise<CryptoKey> {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password.normalize("NFKC")),
    PBKDF2_ALGORITHM,
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: base64UrlToArrayBuffer(salt),
      iterations,
      hash: "SHA-256",
    },
    passwordKey,
    AES_GCM_ALGORITHM,
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptBytes(
  key: CryptoKey,
  payload: BufferSource,
  additionalData?: string,
): Promise<EncryptedBinaryPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      ...(additionalData
        ? { additionalData: textEncoder.encode(additionalData) }
        : {}),
    },
    key,
    payload,
  );

  return {
    version: 1,
    algorithm: "AES-GCM",
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
  };
}

async function decryptBytes(
  key: CryptoKey,
  payload: EncryptedBinaryPayload,
  additionalData?: string,
): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64UrlToArrayBuffer(payload.iv),
      ...(additionalData
        ? { additionalData: textEncoder.encode(additionalData) }
        : {}),
    },
    key,
    base64UrlToArrayBuffer(payload.ciphertext),
  );
}

export async function createPasswordEnvelope(
  accountKey: CryptoKey,
  blindIndexKey: CryptoKey,
  password: string,
  keyVersion: number = 1,
): Promise<PasswordEnvelopePayload> {
  const kdfSalt = generatePasswordSalt();
  const kdfIterations = DEFAULT_PASSWORD_KDF_ITERATIONS;
  const wrappingKey = await derivePasswordWrappingKey(
    password,
    kdfSalt,
    kdfIterations,
  );
  const rawAccountKey = await crypto.subtle.exportKey("raw", accountKey);
  const rawBlindIndexKey = await crypto.subtle.exportKey("raw", blindIndexKey);

  const wrappedAccountKey = await encryptBytes(
    wrappingKey,
    rawAccountKey,
    `account-key:${keyVersion}`,
  );
  const wrappedSearchKey = await encryptBytes(
    wrappingKey,
    rawBlindIndexKey,
    `blind-index-key:${keyVersion}`,
  );

  return {
    kdfAlgorithm: PASSWORD_KDF_ALGORITHM,
    kdfSalt,
    kdfIterations,
    wrappedAccountKey: JSON.stringify(wrappedAccountKey),
    wrappedSearchKey: JSON.stringify(wrappedSearchKey),
    wrapAlgorithm: PASSWORD_WRAP_ALGORITHM,
    keyVersion,
  };
}

export async function unwrapPasswordEnvelope(
  password: string,
  envelope: Pick<
    PasswordEnvelopePayload,
    | "kdfSalt"
    | "kdfIterations"
    | "wrappedAccountKey"
    | "wrappedSearchKey"
    | "keyVersion"
  >,
): Promise<{ accountKey: CryptoKey; blindIndexKey: CryptoKey }> {
  const wrappingKey = await derivePasswordWrappingKey(
    password,
    envelope.kdfSalt,
    envelope.kdfIterations,
  );
  const rawAccountKey = await decryptBytes(
    wrappingKey,
    parseEncryptedBinaryPayload(envelope.wrappedAccountKey),
    `account-key:${envelope.keyVersion}`,
  );
  const rawBlindIndexKey = await decryptBytes(
    wrappingKey,
    parseEncryptedBinaryPayload(envelope.wrappedSearchKey),
    `blind-index-key:${envelope.keyVersion}`,
  );

  const accountKey = await crypto.subtle.importKey(
    "raw",
    rawAccountKey,
    AES_GCM_ALGORITHM,
    true,
    ["encrypt", "decrypt"],
  );
  const blindIndexKey = await crypto.subtle.importKey(
    "raw",
    rawBlindIndexKey,
    HMAC_ALGORITHM,
    true,
    ["sign"],
  );

  return { accountKey, blindIndexKey };
}

export async function unwrapAccountKey(
  wrappedKey: string,
  privateKey: CryptoKey,
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    base64UrlToArrayBuffer(wrappedKey),
    privateKey,
    { name: "RSA-OAEP" },
    AES_GCM_ALGORITHM,
    true,
    ["encrypt", "decrypt"],
  );
}

export async function unwrapBlindIndexKey(
  wrappedKey: string,
  privateKey: CryptoKey,
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    base64UrlToArrayBuffer(wrappedKey),
    privateKey,
    { name: "RSA-OAEP" },
    HMAC_ALGORITHM,
    true,
    ["sign"],
  );
}

export async function encryptJsonPayload(
  key: CryptoKey,
  payload: unknown,
  additionalData?: string,
): Promise<EncryptedJsonPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES));
  const data = textEncoder.encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      ...(additionalData
        ? { additionalData: textEncoder.encode(additionalData) }
        : {}),
    },
    key,
    data,
  );

  return {
    version: 1,
    algorithm: "AES-GCM",
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
  };
}

export async function decryptJsonPayload<T>(
  key: CryptoKey,
  payload: EncryptedJsonPayload,
  additionalData?: string,
): Promise<T> {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64UrlToArrayBuffer(payload.iv),
      ...(additionalData
        ? { additionalData: textEncoder.encode(additionalData) }
        : {}),
    },
    key,
    base64UrlToArrayBuffer(payload.ciphertext),
  );

  return JSON.parse(textDecoder.decode(plaintext)) as T;
}

export async function createBlindIndexTokens(
  blindIndexKey: CryptoKey,
  value: string,
): Promise<string[]> {
  const tokens = normalizeBlindIndexText(value);

  if (tokens.length === 0) {
    return [];
  }

  return Promise.all(
    tokens.map(async (token) => {
      const signature = await crypto.subtle.sign(
        "HMAC",
        blindIndexKey,
        textEncoder.encode(token),
      );

      return bytesToBase64Url(new Uint8Array(signature));
    }),
  );
}