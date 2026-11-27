import { stripHtmlTags } from "./html-text";
import { FORWARDED_MESSAGE_HEADER } from "./mail-quote";
export type SignatureSource = {
  textSignature?: string | null;
  htmlSignature?: string | null;
};

export function resolveComposeSignatureIdentity<
  T extends SignatureSource & { id?: string | null },
>(identities: readonly T[], identityId: string | null | undefined): T | null {
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

  const plain = stripHtmlTags(withBreaks, "")
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

function plainTextSignatureSeparator(separator: boolean): string {
  return separator ? "\n\n-- \n" : "\n\n";
}

const QUOTE_HEADER_LINE = new RegExp(`^(?:On .+ wrote:|${FORWARDED_MESSAGE_HEADER})$`, "m");

/** Adds the signature where a new compose puts it: above a reply or forward quote's header when `aboveQuote`, else at the end. */
export function insertPlainTextSignature(
  body: string,
  signature: SignatureSource | null | undefined,
  options: { separator: boolean; aboveQuote: boolean },
): string {
  const plainTextSignature = getPlainTextSignature(signature);
  if (!plainTextSignature) return body;
  const block = `${plainTextSignatureSeparator(options.separator)}${plainTextSignature}`;
  const text = body.replace(/\r\n?/g, "\n");
  const quoteStart = options.aboveQuote ? text.search(QUOTE_HEADER_LINE) : -1;
  if (quoteStart === -1) return `${text.trimEnd()}${block}`;
  return `${text.slice(0, quoteStart).trimEnd()}${block}\n\n${text.slice(quoteStart)}`;
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
