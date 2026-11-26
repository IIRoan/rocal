import { sanitizeUntrustedEmailHtml } from "@workspace/calendar-core/sanitize-email-html";
import {
  FORWARDED_MESSAGE_HEADER,
  isReplyQuoteHeader,
  signatureTextToHtml,
  type SignatureSource,
} from "@workspace/calendar-core";

export {
  getPlainTextSignature,
  hasComposeHtmlBody,
  htmlToPlainText,
  resolveComposePlainBody,
  resolveComposeSignatureIdentity,
  resolveOutgoingComposeBodies,
  type SignatureSource,
} from "@workspace/calendar-core";

export function sanitizeSignatureHtml(html: string): string {
  if (!html.trim()) return "";
  return sanitizeUntrustedEmailHtml(html).trim();
}

/** Embed signature in the editor body with marker paragraphs for identity swaps. */
export function buildEmbeddedSignatureHtml(
  signature: SignatureSource | null | undefined,
  options: { separator: boolean },
): string {
  if (!signature) return "";
  const startMarker = options.separator
    ? `<p data-signature-block="separator">-- </p>`
    : `<p data-signature-block="start"></p>`;
  const endMarker = `<p data-signature-block="end"></p>`;
  if (signature.htmlSignature?.trim()) {
    return `${startMarker}${sanitizeSignatureHtml(signature.htmlSignature)}${endMarker}`;
  }
  if (signature.textSignature?.trim()) {
    return `${startMarker}<p>${signatureTextToHtml(signature.textSignature)}</p>${endMarker}`;
  }
  return "";
}

const QUOTE_SELECTOR = "blockquote, [data-quoted-html]";

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, "");
}

function embeddedSignatureText(doc: Document, signature: SignatureSource): string {
  const host = doc.createElement("div");
  host.innerHTML = buildEmbeddedSignatureHtml(signature, { separator: false });
  return collapseWhitespace(host.textContent ?? "");
}

/** A start marker's block: through its end marker, or up to the quote when the end marker is gone. */
function signatureBlockNodes(start: Element): ChildNode[] {
  const nodes: ChildNode[] = [];
  let cursor: ChildNode | null = start;
  while (cursor) {
    const element = cursor.nodeType === 1 ? (cursor as Element) : null;
    if (cursor !== start && element?.matches(QUOTE_SELECTOR)) break;
    nodes.push(cursor);
    if (cursor !== start && element?.getAttribute("data-signature-block") === "end") break;
    cursor = cursor.nextSibling;
  }
  return nodes;
}

/** Swaps the first block outside the quote that still holds one of `candidates` for `next`, or removes it; null when none does, so edited text stays. */
export function swapEmbeddedSignatureInHtml(
  html: string,
  candidates: readonly SignatureSource[],
  next: SignatureSource | null | undefined,
  options: { separator: boolean },
): string | null {
  if (typeof document === "undefined") return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const expected = new Set(
    candidates.map((candidate) => embeddedSignatureText(doc, candidate)).filter(Boolean),
  );
  const starts = doc.querySelectorAll(
    '[data-signature-block="separator"], [data-signature-block="start"]',
  );
  for (const start of Array.from(starts)) {
    const parent = start.parentNode;
    if (!parent || start.closest(QUOTE_SELECTOR)) continue;
    const nodes = signatureBlockNodes(start);
    const text = collapseWhitespace(nodes.map((node) => node.textContent ?? "").join(""));
    if (!expected.has(text) && !expected.has(text.replace(/^--/, ""))) continue;
    const anchor = nodes[nodes.length - 1]?.nextSibling ?? null;
    for (const node of nodes) node.remove();
    const host = doc.createElement("div");
    host.innerHTML = buildEmbeddedSignatureHtml(next, options);
    for (const node of Array.from(host.childNodes)) parent.insertBefore(node, anchor);
    return doc.body.innerHTML;
  }
  return null;
}

function isQuoteStart(element: Element): boolean {
  const text = element.textContent ?? "";
  return (
    element.matches(QUOTE_SELECTOR) ||
    isReplyQuoteHeader(text) ||
    text.trimStart().startsWith(FORWARDED_MESSAGE_HEADER)
  );
}

/** Adds a signature block where a new compose puts it: above a reply or forward quote's header when `aboveQuote`, else at the end. */
export function insertEmbeddedSignatureHtml(
  html: string,
  signature: SignatureSource | null | undefined,
  options: { separator: boolean; aboveQuote: boolean },
): string {
  const block = buildEmbeddedSignatureHtml(signature, options);
  if (!block) return html;
  if (options.aboveQuote && typeof document !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const quoteStart = Array.from(doc.body.children).find(isQuoteStart);
    if (quoteStart) {
      quoteStart.insertAdjacentHTML("beforebegin", block);
      return doc.body.innerHTML;
    }
  }
  return html.trim() ? `${html}${block}` : `<p></p>${block}`;
}
