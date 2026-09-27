import { sanitizeUntrustedEmailHtml } from "@workspace/calendar-core/sanitize-email-html";
import { signatureTextToHtml, type SignatureSource } from "@workspace/calendar-core";

export {
  appendHtmlSignature,
  appendPlainTextSignature,
  getPlainTextSignature,
  hasComposeHtmlBody,
  hasEmbeddedSignature,
  htmlToPlainText,
  resolveComposePlainBody,
  resolveComposeSignatureIdentity,
  resolveOutgoingComposeBodies,
  stripTrailingPlainTextSignature,
  swapEmbeddedSignatureInPlainText,
  type SignatureSource,
} from "@workspace/calendar-core";

export function sanitizeSignatureHtml(html: string): string {
  if (!html.trim()) return "";
  return sanitizeUntrustedEmailHtml(html).trim();
}

/** Embed signature in the editor body with marker paragraphs for identity swaps. */
export function buildEmbeddedSignatureHtml(
  signature: SignatureSource | null | undefined,
  options: { embed: boolean; separator: boolean },
): string {
  if (!options.embed || !signature) return "";
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

export function swapEmbeddedSignatureInHtml(
  html: string,
  signature: SignatureSource | null | undefined,
  options: { separator: boolean },
): string | null {
  if (typeof document === "undefined") return null;
  const replacement = buildEmbeddedSignatureHtml(signature, {
    embed: true,
    separator: options.separator,
  });
  if (!replacement) return null;

  const doc = new DOMParser().parseFromString(html, "text/html");
  const startEl = doc.querySelector(
    '[data-signature-block="separator"], [data-signature-block="start"]',
  );
  if (!startEl) return null;
  const endEl = doc.querySelector('[data-signature-block="end"]');

  const replacementHost = doc.createElement("div");
  replacementHost.innerHTML = replacement;
  const replacementNodes = Array.from(replacementHost.childNodes);
  const parent = startEl.parentNode;
  if (!parent) return null;

  const removeUntil = endEl && endEl.parentNode === parent ? endEl : null;
  const isQuoteBoundary = (node: ChildNode | null): boolean => {
    if (!node || node.nodeType !== 1) return false;
    const el = node as Element;
    return el.tagName === "BLOCKQUOTE" || el.hasAttribute("data-quoted-html");
  };

  const toRemove: ChildNode[] = [];
  let cursor: ChildNode | null = startEl;
  while (cursor) {
    toRemove.push(cursor);
    if (cursor === removeUntil) break;
    const next: ChildNode | null = cursor.nextSibling;
    if (!removeUntil && isQuoteBoundary(next)) break;
    cursor = next;
  }
  for (const node of toRemove) {
    node.remove();
  }
  for (const node of replacementNodes) {
    parent.insertBefore(node, removeUntil?.nextSibling ?? startEl);
  }
  return doc.body.innerHTML;
}
