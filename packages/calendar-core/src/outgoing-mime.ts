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

function encodeBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  if (typeof btoa === "function") {
    return btoa(binary);
  }

  throw new Error("Base64 encoding is not available in this environment.");
}

function wrapBase64(value: string): string {
  const lines: string[] = [];
  for (let offset = 0; offset < value.length; offset += 76) {
    lines.push(value.slice(offset, offset + 76));
  }
  return lines.join("\r\n");
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

/**
 * Builds a MIME payload for PGP encryption. Rich-text compose bodies are wrapped
 * in multipart/alternative (text/plain + text/html). Attachments use
 * multipart/mixed with the body part as the first subpart.
 */
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
      wrapBase64(encodeBase64(attachment.content)),
      "",
    );
  }

  lines.push(`--${boundary}--`);
  return lines.join("\r\n");
}
