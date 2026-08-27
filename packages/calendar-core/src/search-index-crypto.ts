const AES_GCM_ALGORITHM = "AES-GCM";
const IV_BYTES = 12;

export type EncryptedSearchShard = {
  version: 1;
  algorithm: "AES-GCM";
  iv: string;
  ciphertext: string;
  updatedAt: string;
  itemCount: number;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function requireSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("WebCrypto is unavailable for the private search index.");
  }
  return subtle;
}

export async function generateLocalSearchIndexKey(
  options: { extractable?: boolean } = {},
): Promise<CryptoKey> {
  return requireSubtle().generateKey(
    { name: AES_GCM_ALGORITHM, length: 256 },
    options.extractable === true,
    ["encrypt", "decrypt"],
  );
}

export async function exportLocalSearchIndexKey(
  key: CryptoKey,
): Promise<string> {
  const raw = await requireSubtle().exportKey("raw", key);
  return bytesToBase64Url(new Uint8Array(raw));
}

export async function importLocalSearchIndexKey(
  raw: string,
  options: { extractable?: boolean } = {},
): Promise<CryptoKey> {
  return requireSubtle().importKey(
    "raw",
    base64UrlToBytes(raw),
    { name: AES_GCM_ALGORITHM, length: 256 },
    options.extractable === true,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSearchShard<T>(
  key: CryptoKey,
  value: T,
  options: { additionalData?: string; itemCount?: number } = {},
): Promise<EncryptedSearchShard> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encoded = textEncoder.encode(JSON.stringify(value));
  const ciphertext = await requireSubtle().encrypt(
    {
      name: AES_GCM_ALGORITHM,
      iv,
      ...(options.additionalData
        ? { additionalData: textEncoder.encode(options.additionalData) }
        : {}),
    },
    key,
    encoded,
  );

  return {
    version: 1,
    algorithm: "AES-GCM",
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    updatedAt: new Date().toISOString(),
    itemCount: options.itemCount ?? 0,
  };
}

export async function decryptSearchShard<T>(
  key: CryptoKey,
  shard: EncryptedSearchShard,
  options: { additionalData?: string } = {},
): Promise<T> {
  if (shard.algorithm !== AES_GCM_ALGORITHM || shard.version !== 1) {
    throw new Error("Unsupported local search shard format.");
  }

  const plaintext = await requireSubtle().decrypt(
    {
      name: AES_GCM_ALGORITHM,
      iv: base64UrlToBytes(shard.iv),
      ...(options.additionalData
        ? { additionalData: textEncoder.encode(options.additionalData) }
        : {}),
    },
    key,
    base64UrlToBytes(shard.ciphertext),
  );

  return JSON.parse(textDecoder.decode(plaintext)) as T;
}
