import type { CryptoProvider } from "./crypto-provider";

const HASH_BYTES = 32;
const textEncoder = new TextEncoder();

async function hmacSha256(
  crypto: CryptoProvider,
  key: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256", length: key.length * 8 },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, data));
}

/** RFC 5869 HKDF-SHA-256 with a zero salt and one 32-byte output block; the provider has no deriveBits. */
export async function hkdfSha256(
  crypto: CryptoProvider,
  ikm: Uint8Array<ArrayBuffer>,
  info: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const prk = await hmacSha256(crypto, new Uint8Array(HASH_BYTES), ikm);
  const infoBytes = textEncoder.encode(info);
  const block = new Uint8Array(infoBytes.length + 1);
  block.set(infoBytes, 0);
  block[infoBytes.length] = 0x01;
  return hmacSha256(crypto, prk, block);
}
