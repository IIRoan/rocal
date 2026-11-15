import type { CryptoProvider } from "./crypto-provider";
import { hkdfSha256 } from "./hkdf";

export const RECOVERY_SECRET_BYTES = 16;
const CHECKSUM_BYTES = 4;
const GROUP_LENGTH = 4;
const KEY_LENGTH = ((RECOVERY_SECRET_BYTES + CHECKSUM_BYTES) * 8) / 5;
/** Crockford base32: no I, L, O or U, so a printed key reads back unambiguously. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** The provider has no digest, so the typo check is an HKDF of the secret rather than a plain SHA-256. */
const CHECKSUM_INFO = "solace/recovery-checksum/v1";

function encodeBase32(bytes: Uint8Array): string {
  let output = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = ((buffer << 8) | byte) & 0xfff;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += ALPHABET.charAt((buffer >> bits) & 31);
    }
  }
  if (bits > 0) {
    output += ALPHABET.charAt((buffer << (5 - bits)) & 31);
  }
  return output;
}

function decodeBase32(text: string): Uint8Array | null {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of text) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) return null;
    buffer = ((buffer << 5) | value) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

async function checksum(
  crypto: CryptoProvider,
  secret: Uint8Array,
): Promise<Uint8Array> {
  const digest = await hkdfSha256(crypto, new Uint8Array(secret), CHECKSUM_INFO);
  return digest.subarray(0, CHECKSUM_BYTES);
}

export function generateRecoverySecret(crypto: CryptoProvider): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(RECOVERY_SECRET_BYTES));
}

/** 32 characters in eight groups of four: the secret followed by its checksum. */
export async function formatRecoveryKey(
  crypto: CryptoProvider,
  secret: Uint8Array,
): Promise<string> {
  const payload = new Uint8Array(RECOVERY_SECRET_BYTES + CHECKSUM_BYTES);
  payload.set(secret, 0);
  payload.set(await checksum(crypto, secret), RECOVERY_SECRET_BYTES);
  const encoded = encodeBase32(payload);
  const groups: string[] = [];
  for (let index = 0; index < encoded.length; index += GROUP_LENGTH) {
    groups.push(encoded.slice(index, index + GROUP_LENGTH));
  }
  return groups.join("-");
}

/** The secret of a typed key, or null when it is malformed or fails its checksum. */
export async function parseRecoveryKey(
  crypto: CryptoProvider,
  value: string,
): Promise<Uint8Array | null> {
  const normalized = value
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
  const payload = normalized.length === KEY_LENGTH ? decodeBase32(normalized) : null;
  if (!payload) return null;
  const secret = payload.slice(0, RECOVERY_SECRET_BYTES);
  const expected = await checksum(crypto, secret);
  const actual = payload.subarray(RECOVERY_SECRET_BYTES);
  return expected.every((byte, index) => byte === actual[index]) ? secret : null;
}
