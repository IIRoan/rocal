/** MIME parser for decrypted PGP/MIME payloads, avoiding Blob/ReadableStream APIs that Hermes lacks. */

import {
  MAX_MAIL_MIME_BYTES,
  readMailMimeLeaves,
} from "@workspace/calendar-core/mail-mime-limits";
import {
  resolveNestedPgpMimeCiphertext,
  getPgpMimeEnvelopeContentType,
} from "@workspace/calendar-core/mail-pgp-layers";
import { decodeBase64ToBytes } from "./binary-utils";
import type { JmapAttachment } from "./types";

export interface ParsedMimeBody {
  text: string | null;
  html: string | null;
  attachments: JmapAttachment[];
}

export function parseMimeBody(rawMime: string): ParsedMimeBody {
  const result: ParsedMimeBody = { text: null, html: null, attachments: [] };
  for (const part of readMailMimeLeaves(rawMime)) {
    const { headers } = extractHeaders(part.headers);
    const used =
      (headers.disposition === "attachment" && !part.isRelated) ||
      headers.contentType === "message/rfc822" ||
      (headers.contentType === "text/plain" && result.text === null) ||
      (headers.contentType === "text/html" && result.html === null);
    if (!used) continue;
    const body = rawMime.slice(part.bodyStart, part.end).replace(/\r\n/g, "\n");
    parseLeaf(headers, body, result, part.isRelated);
  }
  return result;
}

interface MimeHeaders {
  contentType: string;
  boundary: string | null;
  charset: string;
  encoding: string;
  disposition: string | null;
  filename: string | null;
  name: string | null;
}

function extractHeaders(text: string): {
  headers: MimeHeaders;
  bodyOffset: number;
} {
  const blankLine = text.indexOf("\n\n");
  if (blankLine === -1) {
    return {
      headers: {
        contentType: "text/plain",
        boundary: null,
        charset: "utf-8",
        encoding: "7bit",
        disposition: null,
        filename: null,
        name: null,
      },
      bodyOffset: text.length,
    };
  }

  const headerSection = text.slice(0, blankLine);
  const bodyOffset = blankLine + 2;

  // Unfold RFC 2822 header continuation lines (whitespace-prefixed next line).
  const unfolded = headerSection.replace(/\n[ \t]+/g, " ");

  let contentType = "text/plain";
  let boundary: string | null = null;
  let charset = "utf-8";
  let encoding = "7bit";
  let disposition: string | null = null;
  let filename: string | null = null;
  let name: string | null = null;

  for (const line of unfolded.split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const headerName = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (headerName === "content-type") {
      const parts = value.split(/\s*;\s*/);
      contentType = (parts[0] ?? "text/plain").toLowerCase().trim();
      for (let i = 1; i < parts.length; i++) {
        const eq = parts[i].indexOf("=");
        if (eq === -1) continue;
        const pName = parts[i].slice(0, eq).trim().toLowerCase();
        const pVal = parts[i]
          .slice(eq + 1)
          .trim()
          .replace(/^"|"$/g, "");
        if (pName === "boundary") boundary = pVal;
        else if (pName === "charset") charset = pVal.toLowerCase();
        else if (pName === "name") name = pVal;
      }
    } else if (headerName === "content-transfer-encoding") {
      encoding = value.toLowerCase().trim();
    } else if (headerName === "content-disposition") {
      const parts = value.split(/\s*;\s*/);
      disposition = (parts[0] ?? "").toLowerCase().trim();
      for (let i = 1; i < parts.length; i++) {
        const eq = parts[i].indexOf("=");
        if (eq === -1) continue;
        const pName = parts[i].slice(0, eq).trim().toLowerCase();
        const pVal = parts[i]
          .slice(eq + 1)
          .trim()
          .replace(/^"|"$/g, "");
        if (pName === "filename") filename = pVal;
      }
    }
  }

  return {
    headers: {
      contentType,
      boundary,
      charset,
      encoding,
      disposition,
      filename,
      name,
    },
    bodyOffset,
  };
}

function parseLeaf(
  headers: MimeHeaders,
  body: string,
  result: ParsedMimeBody,
  isRelated: boolean,
): void {
  const { contentType, encoding, disposition, filename, name } = headers;

  // Match web PostalMime: disposition === "attachment" && !related
  if (
    (disposition === "attachment" && !isRelated) ||
    contentType === "message/rfc822"
  ) {
    const attachmentName =
      filename ||
      name ||
      (contentType === "message/rfc822" ? "message.eml" : "attachment");
    const content = decodeAttachmentBody(body, encoding, contentType);
    result.attachments.push({
      name: attachmentName,
      type: contentType || "application/octet-stream",
      size: content.byteLength,
      content,
    });
    return;
  }

  if (contentType === "text/plain" && result.text === null) {
    result.text = decodeTextBody(body, encoding);
  } else if (contentType === "text/html" && result.html === null) {
    result.html = decodeTextBody(body, encoding);
  }
}

function decodeTextBody(body: string, encoding: string): string {
  const trimmed = body.endsWith("\n") ? body.slice(0, -1) : body;
  switch (encoding) {
    case "quoted-printable":
      return decodeQuotedPrintable(trimmed);
    case "base64":
      return decodeBase64String(trimmed.replace(/\s/g, ""));
    default:
      return trimmed;
  }
}

function decodeAttachmentBody(
  body: string,
  encoding: string,
  contentType: string,
): Uint8Array {
  const trimmed = body.endsWith("\n") ? body.slice(0, -1) : body;
  const isText =
    contentType.startsWith("text/") || contentType === "message/rfc822";

  switch (encoding) {
    case "quoted-printable":
      return decodeQuotedPrintableBytes(trimmed);
    case "base64": {
      const cleaned = trimmed.replace(/\s/g, "");
      try {
        return decodeBase64ToBytes(cleaned);
      } catch {
        return new TextEncoder().encode(cleaned);
      }
    }
    default:
      if (isText) {
        return new TextEncoder().encode(trimmed);
      }
      const bytes = new Uint8Array(trimmed.length);
      for (let i = 0; i < trimmed.length; i++) {
        bytes[i] = trimmed.charCodeAt(i) & 0xff;
      }
      return bytes;
  }
}

function hexNibble(code: number): number {
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 65 && code <= 70) return code - 55;
  if (code >= 97 && code <= 102) return code - 87;
  return -1;
}

function quotedByte(text: string, offset: number): number {
  if (text.charCodeAt(offset) !== 61 || offset + 2 >= text.length) return -1;
  const high = hexNibble(text.charCodeAt(offset + 1));
  const low = hexNibble(text.charCodeAt(offset + 2));
  return high >= 0 && low >= 0 ? (high << 4) | low : -1;
}

function decodeQuotedPrintableBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  let written = 0;
  for (let offset = 0; offset < text.length;) {
    if (text.charCodeAt(offset) === 61 && text.charCodeAt(offset + 1) === 10) {
      offset += 2;
      continue;
    }
    const byte = quotedByte(text, offset);
    if (byte >= 0) {
      bytes[written++] = byte;
      offset += 3;
    } else {
      bytes[written++] = text.charCodeAt(offset) & 0xff;
      offset += 1;
    }
  }
  return written === bytes.length ? bytes : bytes.slice(0, written);
}

function decodeQuotedPrintable(text: string): string {
  const bytes = new Uint8Array(
    /[^\x00-\x7f]/.test(text)
      ? Math.min(text.length * 3, MAX_MAIL_MIME_BYTES)
      : text.length,
  );
  let written = 0;
  for (let offset = 0; offset < text.length;) {
    if (text.charCodeAt(offset) === 61 && text.charCodeAt(offset + 1) === 10) {
      offset += 2;
      continue;
    }
    const byte = quotedByte(text, offset);
    if (byte >= 0) {
      bytes[written++] = byte;
      offset += 3;
      continue;
    }
    let code = text.codePointAt(offset) ?? 0xfffd;
    offset += code > 0xffff ? 2 : 1;
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
    const width = code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    if (written + width > bytes.length)
      throw new Error("Mail MIME decoded content exceeds the size limit.");
    if (width === 1) bytes[written++] = code;
    else {
      if (width === 4) {
        bytes[written++] = 0xf0 | (code >> 18);
        bytes[written++] = 0x80 | ((code >> 12) & 0x3f);
      } else if (width === 3) bytes[written++] = 0xe0 | (code >> 12);
      else bytes[written++] = 0xc0 | (code >> 6);
      if (width > 2) bytes[written++] = 0x80 | ((code >> 6) & 0x3f);
      bytes[written++] = 0x80 | (code & 0x3f);
    }
  }
  return new TextDecoder("utf-8").decode(bytes.subarray(0, written));
}

function decodeBase64String(encoded: string): string {
  try {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return encoded;
  }
}

export function extractNestedPgpMimeCiphertext(rawMime: string): string | null {
  if (!getPgpMimeEnvelopeContentType(rawMime)) return null;
  const parts = readMailMimeLeaves(rawMime);
  if (parts.some((part) => part.depth !== 1))
    throw new Error("Encrypted MIME control parts are invalid.");
  return resolveNestedPgpMimeCiphertext({
    contentType: "multipart/encrypted",
    parts: parts.map((part) => {
      const { headers } = extractHeaders(part.headers);
      return {
        type: headers.contentType,
        body: decodeTextBody(
          rawMime.slice(part.bodyStart, part.end).replace(/\r\n/g, "\n"),
          headers.encoding,
        ),
      };
    }),
  });
}
