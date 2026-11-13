export const MAX_MAIL_MIME_BYTES = 96 * 1024 * 1024;
export const MAX_MAIL_MIME_HEADER_BYTES = 64 * 1024;
export const MAX_MAIL_MIME_DEPTH = 20;
export const MAX_MAIL_MIME_PARTS = 1000;
export const MAX_MAIL_MIME_LINES = 3_000_000;
export const MAX_MAIL_DISPLAY_CHARACTERS = 1_000_000;
export const MAX_MAIL_DISPLAY_HTML_CHARACTERS = 8 * 1024 * 1024;

type MailContent = {
  text?: string | null;
  html?: string | null;
  /** Set when decoding already stopped at a limit, so the content is shorter than the message. */
  truncated?: boolean;
};

/** A prefix of at most `maximum` characters that never ends inside a surrogate pair. */
export function clipMailText(value: string, maximum: number): string {
  if (value.length <= maximum) return value;
  const prefix = value.slice(0, maximum);
  return /[\uD800-\uDBFF]$/.test(prefix) ? prefix.slice(0, -1) : prefix;
}

export function getMailDraftSizeError(input: MailContent): string | null {
  return input.truncated ||
    (input.text?.length ?? 0) > MAX_MAIL_DISPLAY_CHARACTERS ||
    (input.html?.length ?? 0) > MAX_MAIL_MIME_BYTES
    ? "This draft is too large to edit here. The saved draft has not been changed."
    : null;
}

export function limitMailDisplayContent(input: MailContent): {
  text: string | null;
  html: string | null;
} {
  return limitMailContent(
    input,
    "This message is too large to show in full here.",
  );
}

export function limitMailQuoteContent(input: MailContent): {
  text: string | null;
  html: string | null;
} {
  return limitMailContent(input, "[Earlier message shortened.]");
}

function limitMailContent(
  input: MailContent,
  notice: string,
): { text: string | null; html: string | null } {
  const text = input.text ?? null;
  const html = input.html ?? null;
  if (
    !input.truncated &&
    (text?.length ?? 0) <= MAX_MAIL_DISPLAY_CHARACTERS &&
    (html?.length ?? 0) <= MAX_MAIL_DISPLAY_HTML_CHARACTERS
  )
    return { text, html };
  const safePrefix = clipMailText(text ?? "", MAX_MAIL_DISPLAY_CHARACTERS);
  return {
    text: `${safePrefix}${safePrefix ? "\n\n" : ""}${notice}`,
    html: html && html.length <= MAX_MAIL_DISPLAY_HTML_CHARACTERS ? html : null,
  };
}

const MAIL_READ_LIMIT_ERRORS = new Set([
  "Mail MIME exceeds the size limit.",
  "Mail MIME decoded content exceeds the size limit.",
  "Mail MIME exceeds its structural limit.",
  "Mail MIME headers exceed the size limit.",
  "Encrypted message exceeds the decryption size limit.",
  "Encrypted message exceeds the decryption layer limit.",
  "Maximum decompressed message size exceeded",
  "Maximum decompressed size exceeded",
  "Error decrypting message: Maximum decompressed message size exceeded",
  "Error decrypting message: Maximum decompressed size exceeded",
  "This message is too large or complex to open here.",
]);

export function getMailReadLimitNotice(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  if (error.message === "This message has too many lines to open here.")
    return error.message;
  return MAIL_READ_LIMIT_ERRORS.has(error.message) ||
    /^Error decrypting message: (?:Parsing [A-Za-z][A-Za-z0-9_$]* failed: )?Maximum decompressed (?:message )?size exceeded$/.test(
      error.message,
    ) ||
    /^Maximum (?:MIME nesting depth of \d+ levels|header size of \d+ bytes) exceeded$/.test(
      error.message,
    )
    ? "This message is too large or complex to open here."
    : null;
}

export function fitsMailUtf8ByteLimit(
  value: string,
  maximum: number,
  start = 0,
  end = value.length,
): boolean {
  const length = end - start;
  if (length > maximum) return false;
  if (length * 3 <= maximum) return true;
  if (start === 0 && end === value.length && !/[^\x00-\x7f]/.test(value))
    return true;
  let bytes = 0;
  for (let index = start; index < end; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      index + 1 < end &&
      value.charCodeAt(index + 1) >= 0xdc00 &&
      value.charCodeAt(index + 1) <= 0xdfff
    ) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
    if (bytes > maximum) return false;
  }
  return true;
}

export type MailMimeLeaf = {
  headers: string;
  bodyStart: number;
  end: number;
  depth: number;
  isRelated: boolean;
  /** Part number of the innermost enclosing multipart/alternative, 0 when there is none. */
  alternative: number;
};

/** Scans line offsets so newline floods and nested parts cannot multiply the message's memory footprint. */
export function readMailMimeLeaves(raw: string): MailMimeLeaf[] {
  if (!fitsMailUtf8ByteLimit(raw, MAX_MAIL_MIME_BYTES))
    throw new Error("Mail MIME exceeds the size limit.");
  let lines = 1;
  for (
    let newline = raw.indexOf("\n");
    newline >= 0;
    newline = raw.indexOf("\n", newline + 1)
  ) {
    if (++lines > MAX_MAIL_MIME_LINES)
      throw new Error("This message has too many lines to open here.");
  }
  const leaves: MailMimeLeaf[] = [];
  let parts = 0;
  const visit = (
    start: number,
    end: number,
    depth: number,
    isRelated: boolean,
    alternative: number,
  ): void => {
    if (depth > MAX_MAIL_MIME_DEPTH || ++parts > MAX_MAIL_MIME_PARTS)
      throw new Error("Mail MIME exceeds its structural limit.");
    const part = parts;
    let cursor = start;
    let headerEnd = end;
    let bodyStart = end;
    while (cursor < end) {
      const found = raw.indexOf("\n", cursor);
      const lineEnd = found < 0 || found >= end ? end : found;
      const textEnd =
        lineEnd > cursor && raw.charCodeAt(lineEnd - 1) === 13
          ? lineEnd - 1
          : lineEnd;
      if (textEnd === cursor) {
        headerEnd = cursor;
        bodyStart = lineEnd < end ? lineEnd + 1 : end;
        break;
      }
      if (lineEnd - start > MAX_MAIL_MIME_HEADER_BYTES)
        throw new Error("Mail MIME headers exceed the size limit.");
      cursor = lineEnd < end ? lineEnd + 1 : end;
    }
    if (
      !fitsMailUtf8ByteLimit(raw, MAX_MAIL_MIME_HEADER_BYTES, start, headerEnd)
    )
      throw new Error("Mail MIME headers exceed the size limit.");
    const headers = raw.slice(start, bodyStart).replace(/\r\n/g, "\n");
    const types = headers
      .replace(/\n[ \t]+/g, " ")
      .split("\n")
      .map((line) => /^\s*content-type\s*:\s*(.*)$/i.exec(line)?.[1])
      .filter((value): value is string => value !== undefined);
    if (types.length > 1)
      throw new Error("Mail MIME has ambiguous content types.");
    const type = types[0]?.trim() ?? "text/plain";
    if (!/^multipart\//i.test(type) || bodyStart === end) {
      leaves.push({ headers, bodyStart, end, depth, isRelated, alternative });
      return;
    }
    const boundaries = [
      ...type.matchAll(/;\s*boundary\s*=\s*(?:"([^"\r\n]*)"|([^\s;]+))/gi),
    ];
    if (boundaries.length !== 1)
      throw new Error("Mail MIME has an invalid boundary.");
    const boundary = boundaries[0]?.[1] ?? boundaries[0]?.[2] ?? "";
    if (!boundary || boundary.length > 70 || /[\x00-\x1f\x7f]/.test(boundary))
      throw new Error("Mail MIME has an invalid boundary.");
    const opening = `--${boundary}`;
    const childIsRelated =
      isRelated || /^multipart\/related(?:\s*;|\s*$)/i.test(type);
    const childAlternative = /^multipart\/alternative(?:\s*;|\s*$)/i.test(type)
      ? part
      : alternative;
    let childStart: number | null = null;
    cursor = bodyStart;
    while (cursor < end) {
      const found = raw.indexOf("\n", cursor);
      const lineEnd = found < 0 || found >= end ? end : found;
      let delimiter =
        raw.startsWith(opening, cursor) && cursor + opening.length <= lineEnd;
      let suffix = cursor + opening.length;
      const closing =
        delimiter && raw.startsWith("--", suffix) && suffix + 2 <= lineEnd;
      if (closing) suffix += 2;
      for (let index = suffix; delimiter && index < lineEnd; index += 1)
        delimiter = /\s/.test(raw.charAt(index));
      if (delimiter) {
        if (childStart !== null) {
          let childEnd = cursor;
          if (childEnd > childStart && raw.charCodeAt(childEnd - 1) === 10)
            childEnd -= 1;
          if (childEnd > childStart && raw.charCodeAt(childEnd - 1) === 13)
            childEnd -= 1;
          visit(childStart, childEnd, depth + 1, childIsRelated, childAlternative);
        }
        childStart = closing ? null : lineEnd < end ? lineEnd + 1 : end;
        if (closing) break;
      }
      cursor = lineEnd < end ? lineEnd + 1 : end;
    }
    if (childStart !== null)
      visit(childStart, end, depth + 1, childIsRelated, childAlternative);
  };
  visit(0, raw.length, 0, false, 0);
  return leaves;
}

export function assertMailMimeLimits(raw: string): void {
  readMailMimeLeaves(raw);
}
