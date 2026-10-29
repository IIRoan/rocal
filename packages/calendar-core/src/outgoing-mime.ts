export type OutgoingMimeAttachment = {
  filename: string;
  contentType: string;
  content: Uint8Array;
  cid?: string;
  disposition?: "inline" | "attachment";
};

function encodeMimeFilename(value: string): string {
  return value.replace(/["\\]/g, "_");
}

/** 57 bytes encode to one 76-column line, so every chunk ends on a line break. */
const BASE64_CHUNK_BYTES = 57 * 128;

/** 76-column base64 in chunks, so a large attachment never also exists as one binary or unwrapped string (Hermes has no Buffer). */
function encodeBase64Lines(bytes: Uint8Array): string[] {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_BYTES) {
    const chunk = bytes.subarray(offset, offset + BASE64_CHUNK_BYTES);
    chunks.push(btoa(String.fromCharCode(...chunk)).replace(/.{76}(?=.)/g, "$&\r\n"));
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

function buildAlternativeBodyParts(input: {
  text: string;
  html?: string;
}): string[] {
  const normalizedText = toMimeLines(input.text);
  const trimmedHtml = input.html?.trim();

  if (!trimmedHtml) {
    return [
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      normalizedText,
    ];
  }

  const boundary = createMimeBoundary("solace_alt");
  const normalizedHtml = toMimeLines(trimmedHtml);

  return [
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "MIME-Version: 1.0",
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    normalizedText,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    normalizedHtml,
    "",
    `--${boundary}--`,
  ];
}

/** PGP MIME payload: rich text as multipart/alternative, attachments as multipart/mixed with the body first. */
export function buildOutgoingMimeMessage(input: {
  text: string;
  html?: string;
  attachments?: OutgoingMimeAttachment[];
}): string {
  const attachments = input.attachments ?? [];
  const bodyPart = buildAlternativeBodyParts(input);

  if (attachments.length === 0) {
    return bodyPart.join("\r\n");
  }

  const boundary = createMimeBoundary("solace_mixed");
  const lines = [
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "MIME-Version: 1.0",
    "",
    `--${boundary}`,
    ...bodyPart,
    "",
  ];

  for (const attachment of attachments) {
    const filename = encodeMimeFilename(attachment.filename);
    const disposition = attachment.disposition ?? "attachment";
    const cid = attachment.cid?.trim();
    lines.push(
      `--${boundary}`,
      `Content-Type: ${attachment.contentType}; name="${filename}"`,
      disposition === "inline" && cid
        ? `Content-Disposition: inline; filename="${filename}"`
        : `Content-Disposition: attachment; filename="${filename}"`,
      ...(disposition === "inline" && cid
        ? [`Content-ID: <${cid}>`]
        : []),
      "Content-Transfer-Encoding: base64",
      "",
      ...encodeBase64Lines(attachment.content),
      "",
    );
  }

  lines.push(`--${boundary}--`);
  return lines.join("\r\n");
}
