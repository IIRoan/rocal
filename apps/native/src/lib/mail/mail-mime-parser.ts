/**
 * Minimal MIME parser for PGP/MIME decrypted payloads.
 *
 * Handles the subset of MIME that email clients actually produce:
 *   - multipart/mixed, multipart/alternative, multipart/related, multipart/signed
 *   - text/plain and text/html parts
 *   - quoted-printable and base64 content-transfer-encodings
 *
 * Uses NO Blob, ReadableStream, or any API unavailable in React Native / Hermes.
 * This replaces postal-mime, which internally calls `new Blob([ArrayBuffer])` —
 * an operation not supported by React Native's native Blob implementation.
 *
 * Returns the first text/plain and text/html bodies found anywhere in the tree.
 */

export interface ParsedMimeBody {
  text: string | null;
  html: string | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseMimeBody(rawMime: string): ParsedMimeBody {
  const result: ParsedMimeBody = { text: null, html: null };
  // Normalise CRLF → LF once at the top so all internal code works with LF only.
  parsePart(rawMime.replace(/\r\n/g, "\n"), result);
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
}

function extractHeaders(text: string): { headers: MimeHeaders; bodyOffset: number } {
  const blankLine = text.indexOf("\n\n");
  if (blankLine === -1) {
    return {
      headers: { contentType: "text/plain", boundary: null, charset: "utf-8", encoding: "7bit" },
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

  for (const line of unfolded.split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (name === "content-type") {
      const parts = value.split(/\s*;\s*/);
      contentType = (parts[0] ?? "text/plain").toLowerCase().trim();
      for (let i = 1; i < parts.length; i++) {
        const eq = parts[i].indexOf("=");
        if (eq === -1) continue;
        const pName = parts[i].slice(0, eq).trim().toLowerCase();
        const pVal = parts[i].slice(eq + 1).trim().replace(/^"|"$/g, "");
        if (pName === "boundary") boundary = pVal;
        else if (pName === "charset") charset = pVal.toLowerCase();
      }
    } else if (name === "content-transfer-encoding") {
      encoding = value.toLowerCase().trim();
    }
  }

  return { headers: { contentType, boundary, charset, encoding }, bodyOffset };
}

function parsePart(text: string, result: ParsedMimeBody): void {
  const { headers, bodyOffset } = extractHeaders(text);
  const { contentType, boundary, encoding } = headers;

  if (contentType.startsWith("multipart/")) {
    if (!boundary) return;
    const body = text.slice(bodyOffset);
    for (const part of splitOnBoundary(body, boundary)) {
      if (result.text !== null && result.html !== null) break;
      parsePart(part, result);
    }
  } else if (contentType === "text/plain" && result.text === null) {
    result.text = decodeBody(text.slice(bodyOffset), encoding);
  } else if (contentType === "text/html" && result.html === null) {
    result.html = decodeBody(text.slice(bodyOffset), encoding);
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

function decodeBody(body: string, encoding: string): string {
  // Trim a single trailing newline added by the boundary splitter.
  const trimmed = body.endsWith("\n") ? body.slice(0, -1) : body;
  switch (encoding) {
    case "quoted-printable":
      return decodeQuotedPrintable(trimmed);
    case "base64":
      return decodeBase64(trimmed.replace(/\s/g, ""));
    default:
      return trimmed;
  }
}

function decodeQuotedPrintable(text: string): string {
  // Remove soft line breaks (=\n).
  const joined = text.replace(/=\n/g, "");

  // Decode =XX escape sequences, flushing accumulated UTF-8 byte runs via
  // TextDecoder so multi-byte sequences (e.g. =C3=A9 → é) are handled
  // correctly. Literal characters are appended directly.
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

function decodeBase64(encoded: string): string {
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
