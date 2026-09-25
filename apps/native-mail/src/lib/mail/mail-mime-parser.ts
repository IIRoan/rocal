/**
 * Minimal MIME parser for PGP/MIME decrypted payloads.
 *
 * Handles the subset of MIME that email clients actually produce:
 *   - multipart/mixed, multipart/alternative, multipart/related, multipart/signed
 *   - text/plain and text/html parts
 *   - quoted-printable and base64 content-transfer-encodings
 *   - attachment extraction (disposition === "attachment" and not related)
 *
 * Uses NO Blob, ReadableStream, or any API unavailable in React Native / Hermes.
 * This replaces postal-mime, which internally calls `new Blob([ArrayBuffer])` —
 * an operation not supported by React Native's native Blob implementation.
 */

import { decodeBase64ToBytes } from "./binary-utils";
import type { JmapAttachment } from "./types";

export interface ParsedMimeBody {
  text: string | null;
  html: string | null;
  attachments: JmapAttachment[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseMimeBody(rawMime: string): ParsedMimeBody {
  const result: ParsedMimeBody = { text: null, html: null, attachments: [] };
  // Normalise CRLF → LF once at the top so all internal code works with LF only.
  parsePart(rawMime.replace(/\r\n/g, "\n"), result, false);
  return result;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface MimeHeaders {
  contentType: string;
  boundary: string | null;
  charset: string;
  encoding: string;
  disposition: string | null;
  filename: string | null;
  name: string | null;
}

function extractHeaders(text: string): { headers: MimeHeaders; bodyOffset: number } {
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
        const pVal = parts[i].slice(eq + 1).trim().replace(/^"|"$/g, "");
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
        const pVal = parts[i].slice(eq + 1).trim().replace(/^"|"$/g, "");
        if (pName === "filename") filename = pVal;
      }
    }
  }

  return { headers: { contentType, boundary, charset, encoding, disposition, filename, name }, bodyOffset };
}

function parsePart(text: string, result: ParsedMimeBody, isRelated: boolean): void {
  const { headers, bodyOffset } = extractHeaders(text);
  const { contentType, boundary, encoding, disposition, filename, name } = headers;

  if (contentType.startsWith("multipart/")) {
    if (!boundary) return;
    const body = text.slice(bodyOffset);
    const childIsRelated = isRelated || contentType === "multipart/related";
    for (const part of splitOnBoundary(body, boundary)) {
      parsePart(part, result, childIsRelated);
    }
    return;
  }

  // Match web PostalMime: disposition === "attachment" && !related
  if (disposition === "attachment" && !isRelated) {
    const attachmentName = filename || name || "attachment";
    const body = text.slice(bodyOffset);
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
    result.text = decodeTextBody(text.slice(bodyOffset), encoding);
  } else if (contentType === "text/html" && result.html === null) {
    result.html = decodeTextBody(text.slice(bodyOffset), encoding);
  }
}

function splitOnBoundary(body: string, boundary: string): string[] {
  const open = "--" + boundary;
  const close = "--" + boundary + "--";
  const parts: string[] = [];
  let currentLines: string[] = [];
  let inPart = false;

  for (const line of body.split("\n")) {
    const trimmed = line.trimEnd();
    if (trimmed === close) {
      if (inPart) parts.push(currentLines.join("\n"));
      inPart = false;
      currentLines = [];
      break;
    } else if (trimmed === open) {
      if (inPart) parts.push(currentLines.join("\n"));
      currentLines = [];
      inPart = true;
    } else if (inPart) {
      currentLines.push(line);
    }
  }

  if (inPart && currentLines.length > 0) {
    parts.push(currentLines.join("\n"));
  }

  return parts;
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

function decodeAttachmentBody(body: string, encoding: string, contentType: string): Uint8Array {
  const trimmed = body.endsWith("\n") ? body.slice(0, -1) : body;
  const isText = contentType.startsWith("text/");

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

function decodeQuotedPrintableBytes(text: string): Uint8Array {
  const joined = text.replace(/=\n/g, "");
  const bytes: number[] = [];

  let i = 0;
  while (i < joined.length) {
    if (
      joined[i] === "=" &&
      i + 2 < joined.length &&
      /[0-9A-Fa-f]{2}/.test(joined.slice(i + 1, i + 3))
    ) {
      bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 3;
    } else {
      bytes.push(joined.charCodeAt(i) & 0xff);
      i++;
    }
  }

  return new Uint8Array(bytes);
}

function decodeQuotedPrintable(text: string): string {
  const joined = text.replace(/=\n/g, "");

  let result = "";
  let byteBuffer: number[] = [];

  const flushBuffer = () => {
    if (byteBuffer.length > 0) {
      result += new TextDecoder("utf-8").decode(new Uint8Array(byteBuffer));
      byteBuffer = [];
    }
  };

  let i = 0;
  while (i < joined.length) {
    if (
      joined[i] === "=" &&
      i + 2 < joined.length &&
      /[0-9A-Fa-f]{2}/.test(joined.slice(i + 1, i + 3))
    ) {
      byteBuffer.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 3;
    } else {
      flushBuffer();
      result += joined[i];
      i++;
    }
  }

  flushBuffer();
  return result;
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
