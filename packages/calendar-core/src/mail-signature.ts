export type SignatureSource = {
  textSignature?: string | null;
  htmlSignature?: string | null;
};

export function resolveComposeSignatureIdentity<
  T extends SignatureSource & { id?: string | null },
>(identities: T[], identityId: string | null | undefined): T | null {
  const current =
    identities.find((entry) => entry.id === identityId) ?? identities[0] ?? null;
  if (!current) return null;
  if (current.htmlSignature?.trim() || current.textSignature?.trim()) {
    return current;
  }
  return (
    identities.find(
      (entry) => entry.htmlSignature?.trim() || entry.textSignature?.trim(),
    ) ?? current
  );
}

function normalizeSignatureLineBreaks(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Escapes a plain-text signature and keeps its line breaks as `<br>`. */
export function signatureTextToHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

export function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n");

  const plain = withBreaks
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n");

  return normalizeSignatureLineBreaks(plain);
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

function plainTextSignatureSeparator(separator: boolean | undefined): string {
  return separator === false ? "\n\n" : "\n\n-- \n";
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
  return `${body}${plainTextSignatureSeparator(options.separator)}${plainTextSignature}`;
}

/** Puts the signature before a seeded reply/forward quote so the quote stays last. */
export function prependPlainTextSignature(
  quoteBody: string,
  signature?: SignatureSource | null,
  options: { separator?: boolean } = {},
): string {
  const plainTextSignature = getPlainTextSignature(signature);
  if (!plainTextSignature) return quoteBody;
  return `${plainTextSignatureSeparator(options.separator)}${plainTextSignature}${quoteBody}`;
}

/** Locates the signature on its own lines, widened over a directly preceding `--` separator line. */
function findPlainTextSignatureBlock(
  text: string,
  signature: string,
): { start: number; end: number } | null {
  let from = 0;
  while (from <= text.length) {
    const index = text.indexOf(signature, from);
    if (index === -1) return null;
    const end = index + signature.length;
    const startsLine = index === 0 || text[index - 1] === "\n";
    const endsLine = end === text.length || text[end] === "\n";
    if (startsLine && endsLine) {
      const separator = /(^|\n)-- ?\n$/.exec(text.slice(0, index));
      const start = separator
        ? index - separator[0].length + (separator[1] ?? "").length
        : index;
      return { start, end };
    }
    from = index + 1;
  }
  return null;
}

/** True when the body already holds the signature on its own lines (quoted `> ` lines never match). */
export function hasPlainTextSignatureBlock(
  body: string,
  signature?: SignatureSource | null,
): boolean {
  const plainTextSignature = getPlainTextSignature(signature);
  if (!plainTextSignature) return false;
  return findPlainTextSignatureBlock(body.replace(/\r\n?/g, "\n"), plainTextSignature) !== null;
}

/** Swaps an embedded signature for another identity's; null when the previous one is not in the body. */
export function replacePlainTextSignatureBlock(
  body: string,
  previousSignature: SignatureSource | null | undefined,
  nextSignature: SignatureSource | null | undefined,
  options: { separator: boolean },
): string | null {
  const previous = getPlainTextSignature(previousSignature);
  if (!previous) return null;
  const text = body.replace(/\r\n?/g, "\n");
  const block = findPlainTextSignatureBlock(text, previous);
  if (!block) return null;
  const next = getPlainTextSignature(nextSignature);
  const replacement = next ? `${options.separator ? "-- \n" : ""}${next}` : "";
  return `${text.slice(0, block.start)}${replacement}${text.slice(block.end)}`;
}

export function stripTrailingPlainTextSignature(
  body: string,
  signature?: SignatureSource | null,
  options: { separator?: boolean } = {},
): string {
  const plainTextSignature = getPlainTextSignature(signature);
  if (!plainTextSignature || !bodyEndsWithPlainTextSignature(body, plainTextSignature)) {
    return body;
  }

  const normalizedBody = normalizeSignatureLineBreaks(body);
  const normalizedSignature = normalizeSignatureLineBreaks(plainTextSignature);
  if (normalizedBody === normalizedSignature) {
    return "";
  }

  const sep = plainTextSignatureSeparator(options.separator);
  const suffix = normalizeSignatureLineBreaks(`${sep}${plainTextSignature}`);
  if (normalizedBody.endsWith(suffix)) {
    return normalizedBody.slice(0, normalizedBody.length - suffix.length).replace(/\n+$/, "");
  }

  if (normalizedBody.endsWith(`-- \n${normalizedSignature}`)) {
    const altSuffix = `-- \n${normalizedSignature}`;
    return normalizedBody
      .slice(0, normalizedBody.length - altSuffix.length)
      .replace(/\n+$/, "");
  }

  if (normalizedBody.endsWith(normalizedSignature)) {
    return normalizedBody
      .slice(0, normalizedBody.length - normalizedSignature.length)
      .replace(/\n+$/, "");
  }

  return body;
}

export function swapEmbeddedSignatureInPlainText(
  body: string,
  previousSignature: SignatureSource | null | undefined,
  newSignature: SignatureSource | null | undefined,
  options: { separator: boolean },
): string | null {
  const stripped = stripTrailingPlainTextSignature(body, previousSignature, {
    separator: options.separator,
  });
  const hadEmbeddedSignature = stripped !== body;
  const nextSignature = getPlainTextSignature(newSignature);

  if (!nextSignature) {
    return hadEmbeddedSignature ? stripped : null;
  }

  if (!hadEmbeddedSignature && normalizeSignatureLineBreaks(body)) {
    return null;
  }

  return appendPlainTextSignature(stripped, newSignature, {
    separator: options.separator,
  });
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
    return `${htmlBody}${sep}${signatureTextToHtml(signature.textSignature)}`;
  }
  return htmlBody;
}

/** True when compose HTML has visible text (any rich-editor output with content). */
export function hasComposeHtmlBody(html: string): boolean {
  const trimmed = html.trim();
  if (!trimmed) return false;
  return htmlToPlainText(trimmed).trim().length > 0;
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

/** True when compose HTML already contains an embedded signature block. */
export function hasEmbeddedSignature(html: string): boolean {
  return /data-signature-block=/i.test(html);
}

/** Resolve multipart/alternative bodies for draft save and send. */
export function resolveOutgoingComposeBodies(input: {
  body: string;
  htmlBody: string;
  signature?: SignatureSource | null;
  signatureAlreadyEmbedded?: boolean;
}): { textBody: string; htmlBody?: string } {
  const trimmedHtml = input.htmlBody.trim();
  const plainFromHtml = trimmedHtml ? htmlToPlainText(trimmedHtml).trim() : "";
  const basePlain = plainFromHtml || input.body.trim();
  const signature = input.signatureAlreadyEmbedded ? null : input.signature;
  const textBody = appendPlainTextSignature(basePlain, signature);
  const htmlBody = trimmedHtml
    ? appendHtmlSignature(trimmedHtml, signature)
    : undefined;
  return { textBody, htmlBody };
}
