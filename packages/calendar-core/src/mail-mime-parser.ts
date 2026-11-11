import { replaceHtmlTags } from "./html-text";
import { decodeMailHtmlEntities } from "./mail-html-entities";
import {
  clipMailText,
  MAX_MAIL_DISPLAY_CHARACTERS,
  MAX_MAIL_DISPLAY_HTML_CHARACTERS,
  MAX_MAIL_MIME_BYTES,
  readMailMimeLeaves,
  type MailMimeLeaf,
} from "./mail-mime-limits";
import {
  getPgpMimeEnvelopeContentType,
  resolveNestedPgpMimeCiphertext,
} from "./mail-pgp-layers";
import { signatureTextToHtml } from "./mail-signature";
import { looksLikeMimeMessage } from "./outgoing-mime";

export type ParsedMailAttachment = {
  filename: string | null;
  mimeType: string;
  content: Uint8Array<ArrayBuffer>;
};

export type ParsedMailContent = {
  text: string | null;
  html: string | null;
  attachments: ParsedMailAttachment[];
  /** Decoding stopped at a limit, so the text or HTML is shorter than the message. */
  truncated: boolean;
};

export type MailTextLimits = { text: number; html: number };

export const MAIL_DISPLAY_TEXT_LIMITS: MailTextLimits = {
  text: MAX_MAIL_DISPLAY_CHARACTERS,
  html: MAX_MAIL_DISPLAY_HTML_CHARACTERS,
};

/** A draft is refused rather than shortened, so its HTML keeps the size drafts were always allowed. */
export const MAIL_DRAFT_TEXT_LIMITS: MailTextLimits = {
  text: MAX_MAIL_DISPLAY_CHARACTERS,
  html: MAX_MAIL_MIME_BYTES,
};

const MAX_HEADER_VALUE_CHARACTERS = 8192;
const ENCODED_WORD = /=\?([\w\-*]+)\?([QqBb])\?([^?]*)\?=/g;
const ENCODED_WORD_RUN =
  /=\?[\w\-*]+\?[QqBb]\?[^?]*\?=(?:\s*=\?[\w\-*]+\?[QqBb]\?[^?]*\?=)*/g;

type DecodedBytes = { bytes: Uint8Array<ArrayBuffer>; truncated: boolean };

type LeafHeaders = {
  type: string;
  charset: string;
  flowed: boolean;
  delSp: boolean;
  encoding: string;
  disposition: string;
  filename: string | null;
  hasContentId: boolean;
};

function hexNibble(code: number): number {
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 65 && code <= 70) return code - 55;
  if (code >= 97 && code <= 102) return code - 87;
  return -1;
}

/** Quoted-printable to bytes in one pass that stops at `maxBytes`; literal non-ASCII text becomes UTF-8. */
function decodeQuotedPrintable(
  raw: string,
  start: number,
  end: number,
  maxBytes: number,
): DecodedBytes {
  const length = end - start;
  const widest =
    maxBytes > length && /[^\x00-\x7f]/.test(raw.slice(start, end))
      ? length * 3
      : length;
  const capacity = Math.min(maxBytes, widest);
  const bytes = new Uint8Array(capacity);
  let written = 0;
  let offset = start;
  while (offset < end) {
    const code = raw.charCodeAt(offset);
    const next = offset + 1 < end ? raw.charCodeAt(offset + 1) : 10;
    if (code === 13 && next === 10) {
      offset += 1;
      continue;
    }
    if (code === 61) {
      if (next === 10) {
        offset += 2;
        continue;
      }
      const afterNext = offset + 2 < end ? raw.charCodeAt(offset + 2) : 10;
      if (next === 13 && afterNext === 10) {
        offset += 3;
        continue;
      }
      const high = hexNibble(next);
      const low = hexNibble(afterNext);
      if (high >= 0 && low >= 0) {
        if (written >= capacity) break;
        bytes[written++] = (high << 4) | low;
        offset += 3;
        continue;
      }
    }
    if (code < 0x80) {
      if (written >= capacity) break;
      bytes[written++] = code;
      offset += 1;
      continue;
    }
    let point = raw.codePointAt(offset) ?? 0xfffd;
    const units = point > 0xffff ? 2 : 1;
    if (point >= 0xd800 && point <= 0xdfff) point = 0xfffd;
    const width = point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
    if (written + width > capacity) break;
    if (width === 4) {
      bytes[written++] = 0xf0 | (point >> 18);
      bytes[written++] = 0x80 | ((point >> 12) & 0x3f);
    } else if (width === 3) bytes[written++] = 0xe0 | (point >> 12);
    else bytes[written++] = 0xc0 | (point >> 6);
    if (width > 2) bytes[written++] = 0x80 | ((point >> 6) & 0x3f);
    bytes[written++] = 0x80 | (point & 0x3f);
    offset += units;
  }
  return {
    bytes: written === capacity ? bytes : bytes.slice(0, written),
    truncated: offset < end,
  };
}

/** Base64 to bytes, reading only as much input as `maxBytes` needs; characters outside the alphabet are skipped. */
function decodeBase64(
  raw: string,
  start: number,
  end: number,
  maxBytes: number,
): DecodedBytes {
  const maxCharacters = Math.ceil(maxBytes / 3) * 4;
  let encoded = "";
  let offset = start;
  while (offset < end && encoded.length <= maxCharacters) {
    const window = Math.min(end - offset, maxCharacters + 4);
    encoded += raw
      .slice(offset, offset + window)
      .replace(/[^A-Za-z0-9+/]+/g, "");
    offset += window;
  }
  const truncated = encoded.length > maxCharacters;
  if (truncated) encoded = encoded.slice(0, maxCharacters);
  if (encoded.length % 4 === 1) encoded = encoded.slice(0, -1);
  let binary: string;
  try {
    binary = atob(encoded + "=".repeat((4 - (encoded.length % 4)) % 4));
  } catch {
    return { bytes: new TextEncoder().encode(encoded), truncated };
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return { bytes, truncated };
}

function decodeBytes(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

function percentDecode(value: string): Uint8Array<ArrayBuffer> {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const high = hexNibble(value.charCodeAt(index + 1));
    const low = hexNibble(value.charCodeAt(index + 2));
    if (value.charAt(index) === "%" && high >= 0 && low >= 0) {
      bytes.push((high << 4) | low);
      index += 2;
    } else bytes.push(...new TextEncoder().encode(value.charAt(index)));
  }
  return new Uint8Array(bytes);
}

/** RFC 2047 words; adjacent words in one charset are joined as bytes, so a character split across them survives. */
function decodeEncodedWords(value: string): string {
  return value.replace(ENCODED_WORD_RUN, (run) => {
    let decoded = "";
    let charset = "";
    let bytes: number[] = [];
    const flush = () => {
      if (bytes.length > 0)
        decoded += decodeBytes(new Uint8Array(bytes), charset);
      bytes = [];
    };
    for (const word of run.matchAll(ENCODED_WORD)) {
      const wordCharset = (word[1] ?? "").split("*")[0] ?? "";
      if (wordCharset.toLowerCase() !== charset.toLowerCase()) flush();
      charset = wordCharset;
      const text = (word[3] ?? "").replace(/_/g, " ");
      const part =
        (word[2] ?? "").toUpperCase() === "B"
          ? decodeBase64(text, 0, text.length, Infinity)
          : decodeQuotedPrintable(text, 0, text.length, Infinity);
      bytes.push(...part.bytes);
    }
    flush();
    return decoded;
  });
}

function readStructuredHeader(input: string): {
  value: string;
  params: Map<string, string>;
} {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input.charAt(index);
    if (quoted && char === "\\" && index + 1 < input.length) {
      index += 1;
      field += input.charAt(index);
    } else if (char === '"') quoted = !quoted;
    else if (char === ";" && !quoted) {
      fields.push(field);
      field = "";
    } else field += char;
  }
  fields.push(field);
  const params = new Map<string, string>();
  for (const entry of fields.slice(1)) {
    const equals = entry.indexOf("=");
    if (equals > 0)
      params.set(
        entry.slice(0, equals).trim().toLowerCase(),
        entry.slice(equals + 1).trim(),
      );
  }
  return { value: (fields[0] ?? "").trim().toLowerCase(), params };
}

/** A parameter with its RFC 2231 charset and continuation forms (`name*`, `name*0`, `name*1*`) resolved. */
function readParameter(
  params: Map<string, string>,
  name: string,
): string | null {
  const pieces: { index: number; value: string }[] = [];
  let charset = "utf-8";
  params.forEach((value, key) => {
    const match = /^(.*?)\*(?:(\d+)\*?)?$/.exec(key);
    if (!match || match[1] !== name) return;
    const index = Number(match[2] ?? 0);
    const extended = /^([^']*)'[^']*'(.*)$/.exec(value);
    if (index === 0 && key.endsWith("*") && extended) {
      charset = extended[1] || "utf-8";
      pieces.push({ index, value: extended[2] ?? "" });
    } else pieces.push({ index, value });
  });
  if (pieces.length === 0) return params.get(name) || null;
  pieces.sort((left, right) => left.index - right.index);
  return decodeBytes(
    percentDecode(pieces.map((piece) => piece.value).join("")),
    charset,
  );
}

function headerValue(headers: string, name: string): string | null {
  const match = new RegExp(`^[^\\S\\n]*${name}[^\\S\\n]*:(.*)$`, "im").exec(
    headers,
  );
  return match
    ? (match[1] ?? "").trim().slice(0, MAX_HEADER_VALUE_CHARACTERS)
    : null;
}

function readLeafHeaders(block: string): LeafHeaders {
  const headers = block.replace(/\n[ \t]+/g, " ");
  const typeValue = headerValue(headers, "content-type");
  const type = readStructuredHeader(typeValue ?? "text/plain");
  const disposition = readStructuredHeader(
    headerValue(headers, "content-disposition") ?? "",
  );
  const filename =
    readParameter(disposition.params, "filename") ??
    readParameter(type.params, "name");
  return {
    type: type.value,
    charset: type.params.get("charset") ?? "utf-8",
    flowed: /^flowed$/i.test(type.params.get("format") ?? ""),
    delSp: /^yes$/i.test(type.params.get("delsp") ?? ""),
    encoding:
      (headerValue(headers, "content-transfer-encoding") ?? "")
        .toLowerCase()
        .split(/[^\w-]/)[0] ?? "",
    disposition: disposition.value,
    filename: filename ? decodeEncodedWords(filename) : null,
    hasContentId: Boolean(headerValue(headers, "content-id")),
  };
}

/** RFC 3676 format=flowed: a line ending in a space continues on the next one, except the "-- " signature separator. */
function unfoldFlowedText(text: string, delSp: boolean): string {
  const lines: string[] = [];
  let pieces: string[] = [];
  let length = 0;
  let open = false;
  for (const line of text.split("\n")) {
    const last = pieces[pieces.length - 1] ?? "";
    const soft =
      open &&
      last.endsWith(" ") &&
      !(length === 3 && pieces.join("") === "-- ");
    if (!soft) {
      if (open) lines.push(pieces.join(""));
      pieces = [];
      length = 0;
      open = true;
    } else if (delSp) {
      pieces[pieces.length - 1] = last.slice(0, -1);
      length -= 1;
      if (last.length === 1) pieces.pop();
    }
    if (line) {
      pieces.push(line);
      length += line.length;
    }
  }
  if (open) lines.push(pieces.join(""));
  return lines.join("\n").replace(/^ /gm, "");
}

/** Decodes at most `maxCharacters` of a text part and reports whether the part held more. */
function decodeLeafText(
  raw: string,
  leaf: MailMimeLeaf,
  headers: LeafHeaders,
  maxCharacters: number,
): { value: string; truncated: boolean } {
  const { bodyStart: start, end } = leaf;
  let value: string;
  let truncated: boolean;
  if (
    headers.encoding === "base64" ||
    headers.encoding === "quoted-printable"
  ) {
    const maxBytes = maxCharacters * 3 + 3;
    const decoded =
      headers.encoding === "base64"
        ? decodeBase64(raw, start, end, maxBytes)
        : decodeQuotedPrintable(raw, start, end, maxBytes);
    value = decodeBytes(decoded.bytes, headers.charset);
    truncated = decoded.truncated;
  } else {
    const windowEnd = Math.min(end, start + maxCharacters * 2 + 2);
    value = raw.slice(start, windowEnd).replace(/\r\n/g, "\n");
    truncated = windowEnd < end;
  }
  if (headers.flowed) value = unfoldFlowedText(value, headers.delSp);
  return {
    value: clipMailText(value, maxCharacters),
    truncated: truncated || value.length > maxCharacters,
  };
}

function decodeLeafBytes(
  raw: string,
  leaf: MailMimeLeaf,
  encoding: string,
): Uint8Array<ArrayBuffer> {
  if (encoding === "base64")
    return decodeBase64(raw, leaf.bodyStart, leaf.end, Infinity).bytes;
  if (encoding === "quoted-printable")
    return decodeQuotedPrintable(raw, leaf.bodyStart, leaf.end, Infinity).bytes;
  return new TextEncoder().encode(
    raw.slice(leaf.bodyStart, leaf.end).replace(/\r\n/g, "\n"),
  );
}

const BLOCK_TAGS = new Set(["p", "div", "table", "tr", "td", "th"]);
const INLINE_TAGS = new Set(["span", "em", "i", "strong", "b", "u", "a"]);
const LIST_ITEM = "\u0002";

/** One HTML part as text for a message that also has plain parts: link targets, list bullets and rules stay readable. */
function htmlPartToText(html: string): string {
  // Each pattern ends at the end of input, so an unclosed comment, element or tag is one match and hostile mail stays linear.
  const marked = html
    .replace(/\r?\n/g, "\u0001")
    .replace(/<!--[\s\S]*?(?:-->|$)/g, " ")
    .replace(/<(script|style|head)\b[\s\S]*?(?:<\/\1\s*>|$)/gi, " ");
  const text = replaceHtmlTags(marked, (tag) => {
    const name = (/^<\/?([a-z][a-z0-9]*)/i.exec(tag)?.[1] ?? "").toLowerCase();
    const closing = tag.charAt(1) === "/";
    if (name === "br") return "\n";
    if (BLOCK_TAGS.has(name)) return "\n\n";
    if (name === "hr") return "\n-------------\n";
    if (name === "li" && !closing) return LIST_ITEM;
    const href =
      name === "a" && !closing
        ? /\bhref\s*=\s*["']?([^\s"'>]+)/i.exec(tag)?.[1]
        : undefined;
    if (href) return ` (${href}) `;
    return INLINE_TAGS.has(name) ? "" : " ";
  })
    .replace(/\u0002[\u0001\s]*/g, "* ")
    .replace(/\u0001/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/^[ \t]+$/gm, "")
    .replace(/\n\n+/g, "\n\n")
    .replace(/^\n+/, "\n")
    .replace(/\n+$/, "\n");
  return decodeMailHtmlEntities(text);
}

function plainPartToHtml(text: string): string {
  return `<div>${signatureTextToHtml(text.trim())}</div>`;
}

/** Reads a MIME message from offsets, decoding no more body text than `limits` allows; attachments are decoded whole. */
export function parseMailMimeContent(
  raw: string,
  limits: MailTextLimits = MAIL_DISPLAY_TEXT_LIMITS,
): ParsedMailContent {
  type TextGroup = { plain: string[]; html: string[] };
  const groups: TextGroup[] = [];
  const alternatives = new Map<number, TextGroup>();
  const attachments: ParsedMailAttachment[] = [];
  let textLeft = limits.text;
  let htmlLeft = limits.html;
  let hasPlain = false;
  let hasHtml = false;
  let htmlDropped = false;
  let truncated = false;
  for (const leaf of readMailMimeLeaves(raw)) {
    const headers = readLeafHeaders(leaf.headers);
    const isHtml = headers.type === "text/html";
    if (
      headers.disposition !== "attachment" &&
      (isHtml || headers.type === "text/plain")
    ) {
      let group = alternatives.get(leaf.alternative);
      if (!group) {
        group = { plain: [], html: [] };
        groups.push(group);
        if (leaf.alternative) alternatives.set(leaf.alternative, group);
      }
      const decoded = decodeLeafText(
        raw,
        leaf,
        headers,
        isHtml ? htmlLeft : textLeft,
      );
      // A nested part whose headers end in a blank line has a body line even when that line is empty.
      const hasBodyLine =
        leaf.bodyStart < leaf.end ||
        (leaf.depth > 0 && /(?:^|\n)\n$/.test(leaf.headers));
      // Identity and quoted-printable parts end with a line break, so joined parts keep a blank line between them.
      const chunk =
        decoded.truncated || headers.encoding === "base64" || !hasBodyLine
          ? decoded.value
          : `${decoded.value}\n`;
      if (isHtml) {
        hasHtml = true;
        htmlLeft -= decoded.value.length;
        if (decoded.truncated) htmlDropped = true;
        group.html.push(chunk);
      } else {
        hasPlain = true;
        textLeft -= decoded.value.length;
        group.plain.push(chunk);
      }
      if (decoded.truncated) truncated = true;
    } else if (
      (headers.disposition === "attachment" &&
        !(leaf.isRelated && headers.hasContentId)) ||
      headers.type === "message/rfc822"
    ) {
      attachments.push({
        filename:
          headers.filename ??
          (headers.type === "message/rfc822" ? "message.eml" : null),
        mimeType: headers.type || "application/octet-stream",
        content: decodeLeafBytes(raw, leaf, headers.encoding),
      });
    }
  }
  const join = (
    own: "plain" | "html",
    convert: (value: string) => string,
  ): string => {
    const other = own === "plain" ? "html" : "plain";
    const chunks: string[] = [];
    for (const group of groups)
      chunks.push(
        ...(group[own].length > 0 ? group[own] : group[other].map(convert)),
      );
    return chunks.join("\n");
  };
  const text = hasPlain ? join("plain", htmlPartToText) : "";
  const html = hasHtml && !htmlDropped ? join("html", plainPartToHtml) : "";
  const shownText = text ? text.trim() : null;
  const shownHtml = html ? html.trim() : null;
  const htmlFits = (shownHtml?.length ?? 0) <= limits.html;
  return {
    text: shownText === null ? null : clipMailText(shownText, limits.text),
    html: htmlFits ? shownHtml : null,
    attachments,
    truncated: truncated || !htmlFits || (shownText?.length ?? 0) > limits.text,
  };
}

/** Bounded reader content for a decrypted payload; one that is not MIME is its own text. */
export function parseDecryptedMailContent(
  plaintext: string,
  limits: MailTextLimits = MAIL_DISPLAY_TEXT_LIMITS,
): ParsedMailContent {
  if (looksLikeMimeMessage(plaintext))
    return parseMailMimeContent(plaintext, limits);
  return {
    text: clipMailText(plaintext, limits.text),
    html: null,
    attachments: [],
    truncated: plaintext.length > limits.text,
  };
}

/** The armored inner message of an RFC 3156 envelope, or null when the payload is not one. */
export function extractNestedPgpMimeCiphertext(raw: string): string | null {
  const contentType = getPgpMimeEnvelopeContentType(raw);
  if (!contentType) return null;
  const leaves = readMailMimeLeaves(raw);
  if (leaves.some((leaf) => leaf.depth !== 1))
    throw new Error("Encrypted MIME control parts are invalid.");
  return resolveNestedPgpMimeCiphertext({
    contentType,
    parts: leaves.map((leaf) => {
      const headers = readLeafHeaders(leaf.headers);
      return {
        type: headers.type,
        body: decodeLeafText(raw, leaf, headers, Infinity).value,
      };
    }),
  });
}
