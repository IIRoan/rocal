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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n");

  if (typeof document === "undefined") {
    return normalizeSignatureLineBreaks(
      withBreaks.replace(/<[^>]+>/g, " ").replace(/[ \t]+\n/g, "\n"),
    );
  }

  const doc = new DOMParser().parseFromString(withBreaks, "text/html");
  return normalizeSignatureLineBreaks(doc.body.textContent ?? "");
}

export function getPlainTextSignature(
  signature?: SignatureSource | null,
): string {
  if (signature?.textSignature?.trim()) {
    return normalizeSignatureLineBreaks(signature.textSignature);
  }
  if (signature?.htmlSignature?.trim()) {
    return htmlToPlainText(signature.htmlSignature);
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

function bodyEndsWithHtmlSignature(
  htmlBody: string,
  signature: SignatureSource,
): boolean {
  const plainTextSignature = getPlainTextSignature(signature);
  if (!plainTextSignature) return false;
  return bodyEndsWithPlainTextSignature(htmlToPlainText(htmlBody), plainTextSignature);
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

export function appendHtmlSignature(
  htmlBody: string,
  signature?: SignatureSource | null,
  options: { separator?: boolean } = {},
): string {
  if (!signature) return htmlBody;
  if (bodyEndsWithHtmlSignature(htmlBody, signature)) return htmlBody;
  const sep = options.separator === false ? "<br><br>" : "<br><br>-- <br>";
  if (signature.htmlSignature?.trim()) {
    return `${htmlBody}${sep}${signature.htmlSignature}`;
  }
  if (signature.textSignature?.trim()) {
    return `${htmlBody}${sep}${escapeHtml(signature.textSignature).replace(/\n/g, "<br>")}`;
  }
  return htmlBody;
}

export function hasMeaningfulHtmlBody(html: string): boolean {
  const trimmed = html.trim();
  if (!trimmed) return false;
  if (typeof document === "undefined") {
    return /<(?:p|div|br|ul|ol|li|strong|em|b|i|a|img|table)\b/i.test(trimmed);
  }
  const doc = new DOMParser().parseFromString(trimmed, "text/html");
  const text = (doc.body.textContent ?? "").trim();
  if (!text) return false;
  return Boolean(
    doc.body.querySelector(
      "table,img,b,strong,i,em,u,a[href],ul,ol,blockquote,br",
    ),
  );
}

/** Plaintext source of truth for compose/send, preferring rich-text HTML when present. */
export function resolveComposePlainBody(input: {
  body: string;
  htmlBody: string;
}): string {
  const trimmedHtml = input.htmlBody.trim();
  if (trimmedHtml) {
    const fromHtml = htmlToPlainText(trimmedHtml).trim();
    if (fromHtml) {
      return fromHtml;
    }
  }
  return input.body.trim();
}
