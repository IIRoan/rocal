export type OutgoingMimeAttachment = {
  filename: string;
  contentType: string;
  content: Uint8Array;
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

/**
 * Builds a MIME payload for PGP/MIME encryption. When attachments are present
 * the result is multipart/mixed with a text/plain body followed by each file.
 */
export function buildOutgoingMimeMessage(input: {
  text: string;
  attachments?: OutgoingMimeAttachment[];
}): string {
  const normalizedText = input.text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const attachments = input.attachments ?? [];

  if (attachments.length === 0) {
    return [
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      normalizedText.replace(/\n/g, "\r\n"),
    ].join("\r\n");
  }

  const boundary = `solace_mixed_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const lines = [
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "MIME-Version: 1.0",
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    normalizedText.replace(/\n/g, "\r\n"),
    "",
  ];

  for (const attachment of attachments) {
    const filename = encodeMimeFilename(attachment.filename);
    lines.push(
      `--${boundary}`,
      `Content-Type: ${attachment.contentType}; name="${filename}"`,
      `Content-Disposition: attachment; filename="${filename}"`,
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(encodeBase64(attachment.content)),
      "",
    );
  }

  lines.push(`--${boundary}--`);
  return lines.join("\r\n");
}
