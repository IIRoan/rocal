const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const RSA_WRAP_ALGORITHM: RsaHashedKeyGenParams = {
  name: "RSA-OAEP",
  modulusLength: 4096,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

const AES_GCM_ALGORITHM = { name: "AES-GCM", length: 256 } as const;
const HMAC_ALGORITHM = {
  name: "HMAC",
  hash: "SHA-256",
  length: 256,
} as const;

const GCM_IV_BYTES = 12;
const MAX_BLIND_INDEX_TOKENS = 24;

export interface EncryptedJsonPayload {
  version: number;
  algorithm: "AES-GCM";
  iv: string;
  ciphertext: string;
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
    false,
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
    false,
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