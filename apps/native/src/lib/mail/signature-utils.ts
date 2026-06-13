export type SignatureSource = {
  textSignature?: string | null;
  htmlSignature?: string | null;
};

function normalizeSignatureLineBreaks(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getPlainTextSignature(
  signature?: SignatureSource | null,
): string {
  if (signature?.textSignature?.trim()) {
    return normalizeSignatureLineBreaks(signature.textSignature);
  }
  if (signature?.htmlSignature?.trim()) {
    return normalizeSignatureLineBreaks(stripHtmlToText(signature.htmlSignature));
  }
  return "";
}

function bodyEndsWithPlainTextSignature(body: string, signature: string): boolean {
  const normalizedBody = normalizeSignatureLineBreaks(body);
  const normalizedSignature = normalizeSignatureLineBreaks(signature);
  if (!normalizedSignature) return false;
  if (normalizedBody === normalizedSignature) return true;
  if (normalizedBody.endsWith(`-- \n${normalizedSignature}`)) return true;
  return normalizedBody.endsWith(normalizedSignature);
}

export function appendPlainTextSignature(
  body: string,
  signature?: SignatureSource | null,
  options: { separator?: boolean } = {},
): string {
  const plainTextSignature = getPlainTextSignature(signature);
  if (!plainTextSignature) return body;
  if (bodyEndsWithPlainTextSignature(body, plainTextSignature)) return body;
  const sep = options.separator === false ? "\n\n" : "\n\n-- \n";
  return `${body}${sep}${plainTextSignature}`;
}
