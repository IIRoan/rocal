/**
 * Binary helpers for mail (MIME parsing, attachment cache writes).
 * Chunked to avoid huge single-string allocations on large attachments.
 */

const BASE64_CHUNK_SIZE = 0x8000;

export function decodeBase64ToBytes(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + BASE64_CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function stringToLatin1Bytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) {
    bytes[i] = value.charCodeAt(i) & 0xff;
  }
  return bytes;
}

/** Decodes inline attachment content the same way web `Blob` parts expect binary data. */
export function normalizeAttachmentContent(
  content: ArrayBuffer | Uint8Array | string,
): Uint8Array {
  if (content instanceof Uint8Array) {
    return content;
  }
  if (content instanceof ArrayBuffer) {
    return new Uint8Array(content);
  }

  const trimmed = content.trim();
  const compact = trimmed.replace(/\s/g, "");
  if (
    compact.length > 0 &&
    compact.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(compact)
  ) {
    try {
      return decodeBase64ToBytes(compact);
    } catch {
      // Fall back to raw bytes when the string is not valid base64.
    }
  }

  return stringToLatin1Bytes(content);
}
