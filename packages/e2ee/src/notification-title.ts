import type { CryptoProvider } from "./crypto-provider";
import { base64UrlToArrayBuffer, bytesToBase64Url } from "./e2ee-module";

/** Wire format "v1.<iv>.<ct+tag>" (unpadded base64url) and HKDF derivation are mirrored in the Swift NSE. */

export const NOTIFICATION_KEY_INFO = "solace/notification-key/v1";
export const NOTIFICATION_TITLE_PREFIX = "v1";
export const MAX_NOTIFICATION_TITLE_LENGTH = 200;

const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const HASH_BYTES = 32;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function notificationTitleAad(eventId: string): string {
  return `notification-title:${NOTIFICATION_TITLE_PREFIX}:${eventId}`;
}

export function normalizeNotificationTitle(value: string): string | null {
  const collapsed = value.trim().replace(/\s+/g, " ");
  if (!collapsed) {
    return null;
  }
  const codePoints = Array.from(collapsed);
  if (codePoints.length <= MAX_NOTIFICATION_TITLE_LENGTH) {
    return collapsed;
  }
  return codePoints.slice(0, MAX_NOTIFICATION_TITLE_LENGTH).join("").trimEnd();
}

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

/** Raw 32-byte notification key, derived from the raw account key. */
export async function deriveNotificationKeyBytes(
  crypto: CryptoProvider,
  accountKey: CryptoKey,
): Promise<Uint8Array<ArrayBuffer>> {
  const ikm = new Uint8Array(await crypto.subtle.exportKey("raw", accountKey));
  const prk = await hmacSha256(crypto, new Uint8Array(HASH_BYTES), ikm);
  const info = textEncoder.encode(NOTIFICATION_KEY_INFO);
  const block = new Uint8Array(info.length + 1);
  block.set(info, 0);
  block[info.length] = 0x01;
  return hmacSha256(crypto, prk, block);
}

export async function importNotificationKey(
  crypto: CryptoProvider,
  keyBytes: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptNotificationTitle(
  crypto: CryptoProvider,
  notificationKey: CryptoKey,
  eventId: string,
  title: string,
): Promise<string | null> {
  const normalized = normalizeNotificationTitle(title);
  if (!normalized) {
    return null;
  }
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES));
  const sealed = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: textEncoder.encode(notificationTitleAad(eventId)),
    },
    notificationKey,
    textEncoder.encode(normalized),
  );
  return [
    NOTIFICATION_TITLE_PREFIX,
    bytesToBase64Url(iv),
    bytesToBase64Url(new Uint8Array(sealed)),
  ].join(".");
}

export async function decryptNotificationTitle(
  crypto: CryptoProvider,
  notificationKey: CryptoKey,
  eventId: string,
  value: string,
): Promise<string> {
  const [prefix, iv, sealed] = value.split(".");
  if (
    prefix !== NOTIFICATION_TITLE_PREFIX ||
    !iv ||
    !sealed ||
    base64UrlToArrayBuffer(iv).byteLength !== GCM_IV_BYTES ||
    base64UrlToArrayBuffer(sealed).byteLength < GCM_TAG_BYTES
  ) {
    throw new Error("Invalid encrypted notification title");
  }
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64UrlToArrayBuffer(iv),
      additionalData: textEncoder.encode(notificationTitleAad(eventId)),
    },
    notificationKey,
    base64UrlToArrayBuffer(sealed),
  );
  return textDecoder.decode(plaintext);
}
