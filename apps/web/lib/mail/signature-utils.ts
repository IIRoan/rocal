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

  const sep = options.separator === false ? "\n\n" : "\n\n-- \n";
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
    return `${htmlBody}${sep}${escapeHtml(signature.textSignature).replace(/\n/g, "<br>")}`;
  }
  return htmlBody;
}

/** True when compose HTML has visible text (any TipTap output with content). */
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

export function sanitizeSignatureHtml(html: string): string {
  if (!html.trim()) return "";
  if (typeof document === "undefined") return html.trim();
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  doc.querySelectorAll("script, style, iframe, object, embed").forEach((el) => {
    el.remove();
  });
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name)) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return doc.body.innerHTML.trim();
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
    const escaped = escapeHtml(signature.textSignature).replace(/\n/g, "<br>");
    return `${startMarker}<p>${escaped}</p>${endMarker}`;
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
