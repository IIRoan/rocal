export type OutgoingMimeAttachment = {
  filename: string;
  contentType: string;
  content: Uint8Array;
  cid?: string;
  disposition?: "inline" | "attachment";
};

function encodeMimeFilename(value: string): string {
  const normalized = value
    .replace(/\r\n|[\r\n\t]/g, " ")
    .replace(/["\\]/g, "_");
  assertAttachmentHeader(normalized, 512);
  return normalized;
}

function assertAttachmentHeader(value: string, maximumBytes: number): void {
  if (
    /[\u0000-\u001f\u007f]/.test(value) ||
    new TextEncoder().encode(value).byteLength > maximumBytes
  ) {
    throw new Error("Attachment metadata is not a valid MIME header value.");
  }
}

/** 57 bytes encode to one 76-column line, so every chunk ends on a line break. */
const BASE64_CHUNK_BYTES = 57 * 128;

/** 76-column base64 in chunks, so a large attachment never also exists as one binary or unwrapped string (Hermes has no Buffer). */
function encodeBase64Lines(bytes: Uint8Array): string[] {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_BYTES) {
    const chunk = bytes.subarray(offset, offset + BASE64_CHUNK_BYTES);
    chunks.push(
      btoa(String.fromCharCode(...chunk)).replace(/.{76}(?=.)/g, "$&\r\n"),
    );
  }
  return chunks;
}

function normalizeMimeText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function toMimeLines(value: string): string {
  return normalizeMimeText(value).replace(/\n/g, "\r\n");
}

function createMimeBoundary(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** True when decrypted PGP plaintext should be parsed as a MIME envelope. */
export function looksLikeMimeMessage(content: string): boolean {
  return /^Content-Type:\s*\S+/im.test(content.trimStart());
}

/** Base64 keeps signed text 7-bit, so relays that rewrap lines or strip trailing spaces cannot break the signature. */
function textPartLines(type: "plain" | "html", value: string, base64: boolean): string[] {
  const lines = toMimeLines(value);
  const encoded = base64 ? encodeBase64Lines(new TextEncoder().encode(lines)) : [];
  return [
    `Content-Type: text/${type}; charset=utf-8`,
    `Content-Transfer-Encoding: ${base64 ? "base64" : "7bit"}`,
    "",
    ...(encoded.length ? encoded : [lines]),
  ];
}

function isInlineImagePart(attachment: OutgoingMimeAttachment): boolean {
  return attachment.disposition === "inline" && Boolean(attachment.cid?.trim());
}

function attachmentPartLines(attachment: OutgoingMimeAttachment): string[] {
  const filename = encodeMimeFilename(attachment.filename);
  const cid = attachment.cid?.trim();
  assertAttachmentHeader(attachment.contentType, 256);
  if (!/^[^\s;/]+\/[^\s;/]+(?:;[^\r\n]*)?$/.test(attachment.contentType)) {
    throw new Error("Attachment content type is invalid.");
  }
  if (cid) {
    assertAttachmentHeader(cid, 256);
    if (/[\s<>]/.test(cid))
      throw new Error("Attachment content identifier is invalid.");
  }
  const inline = isInlineImagePart(attachment);
  return [
    `Content-Type: ${attachment.contentType}; name="${filename}"`,
    `Content-Disposition: ${inline ? "inline" : "attachment"}; filename="${filename}"`,
    ...(inline ? [`Content-ID: <${cid}>`] : []),
    "Content-Transfer-Encoding: base64",
    "",
    ...encodeBase64Lines(attachment.content),
  ];
}

function multipartLines(subtype: string, prefix: string, parts: string[][], topLevel: boolean): string[] {
  const boundary = createMimeBoundary(prefix);
  return [
    `Content-Type: multipart/${subtype}; boundary="${boundary}"`,
    ...(topLevel ? ["MIME-Version: 1.0"] : []),
    "",
    ...parts.flatMap((part) => [`--${boundary}`, ...part, ""]),
    `--${boundary}--`,
  ];
}

function buildAlternativeBodyParts(input: {
  text: string;
  html?: string;
  base64Text?: boolean;
  related: OutgoingMimeAttachment[];
}): string[] {
  const base64 = input.base64Text === true;
  const trimmedHtml = input.html?.trim();

  if (!trimmedHtml) {
    return textPartLines("plain", input.text, base64);
  }

  const htmlPart = textPartLines("html", trimmedHtml, base64);
  // Inline images sit beside the HTML that cites them, so readers show them in place instead of as attachments.
  const richPart = input.related.length
    ? multipartLines("related", "solace_rel", [htmlPart, ...input.related.map(attachmentPartLines)], false)
    : htmlPart;
  return multipartLines("alternative", "solace_alt", [textPartLines("plain", input.text, base64), richPart], true);
}

/** PGP MIME payload: rich text as multipart/alternative with inline images in multipart/related, files in multipart/mixed after the body. */
export function buildOutgoingMimeMessage(input: {
  text: string;
  html?: string;
  attachments?: OutgoingMimeAttachment[];
  base64Text?: boolean;
}): string {
  const attachments = input.attachments ?? [];
  const related = input.html?.trim() ? attachments.filter(isInlineImagePart) : [];
  const files = attachments.filter((attachment) => !related.includes(attachment));
  const bodyPart = buildAlternativeBodyParts({ ...input, related });

  if (files.length === 0) {
    return bodyPart.join("\r\n");
  }

  return multipartLines("mixed", "solace_mixed", [bodyPart, ...files.map(attachmentPartLines)], true).join("\r\n");
}
