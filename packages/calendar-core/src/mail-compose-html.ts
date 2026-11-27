import { sanitizeUntrustedEmailHtml } from "./sanitize-email-html";
import { MAX_MAIL_DISPLAY_HTML_CHARACTERS } from "./mail-mime-limits";
import { decodeMailHtmlEntities } from "./mail-html-entities";
import { FORWARDED_MESSAGE_HEADER, formatReplyQuoteHeader } from "./mail-quote";
import { signatureTextToHtml, type SignatureSource } from "./mail-signature";

/** Marks the block that carries a quoted or forwarded message's own HTML in compose bodies and drafts. */
export const QUOTED_HTML_MARKER = "data-quoted-html";

/** Stands in for a quoted message's `cid:` image until compose has loaded it. */
export const INLINE_IMAGE_PLACEHOLDER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeComposeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Plain text as editor paragraphs: blank lines split paragraphs, single line breaks stay `<br>`. */
export function plainTextToComposeHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeComposeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Wraps sanitized quoted HTML; a forward is marked so its plain-text copy is not `>`-quoted. */
export function buildQuotedHtmlBlock(
  sanitizedInnerHtml: string,
  kind: "reply" | "forward" = "reply",
): string {
  const marker = kind === "forward" ? `${QUOTED_HTML_MARKER}="forward"` : QUOTED_HTML_MARKER;
  return `<div ${marker}>${sanitizedInnerHtml}</div>`;
}

export function sanitizeSignatureHtml(html: string): string {
  if (!html.trim()) return "";
  return sanitizeUntrustedEmailHtml(html).trim();
}

/** A signature between marker paragraphs, so a later identity or signature switch can find it unchanged. */
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

/** A new message's body: an empty writing line above the signature. */
export function buildNewComposeHtml(signatureBlock: string, leadingHtml = ""): string {
  if (!signatureBlock) return leadingHtml;
  return `${leadingHtml || "<p></p>"}${signatureBlock}`;
}

/** A reply or forward opens with an empty writing line, then the signature above or below the quote. */
export function placeComposeQuote(
  quoteHtml: string,
  signatureBlock: string,
  aboveQuote: boolean,
): string {
  return aboveQuote
    ? `<p></p>${signatureBlock}${quoteHtml}`
    : `<p></p>${quoteHtml}${signatureBlock}`;
}

/** Sanitized quoted mail with its `cid:` images swapped for placeholders until compose loads them. */
export function prepareQuotedComposeHtml(bodies: { text?: string | null; html?: string | null }): string {
  const html = bodies.html ?? `<p>${escapeComposeHtml(bodies.text ?? "").replace(/\n/g, "<br>")}</p>`;
  return markComposeCidImages(sanitizeUntrustedEmailHtml(html));
}

export function buildReplyQuoteHtml(input: { date: string; sender: string; quoteHtml: string }): string {
  const header = formatReplyQuoteHeader(escapeComposeHtml(input.date), escapeComposeHtml(input.sender));
  return `<div><p>${header}</p></div>${buildQuotedHtmlBlock(input.quoteHtml)}`;
}

export function buildForwardQuoteHtml(input: {
  from: string;
  date: string;
  subject: string;
  to?: string;
  cc?: string;
  quoteHtml: string;
}): string {
  const lines = [
    FORWARDED_MESSAGE_HEADER,
    `From: ${escapeComposeHtml(input.from)}`,
    `Date: ${escapeComposeHtml(input.date)}`,
    ...(input.to ? [`To: ${escapeComposeHtml(input.to)}`] : []),
    ...(input.cc ? [`Cc: ${escapeComposeHtml(input.cc)}`] : []),
    `Subject: ${escapeComposeHtml(input.subject)}`,
  ];
  return `<div>${lines.join("<br>")}<br><br></div>${buildQuotedHtmlBlock(input.quoteHtml, "forward")}`;
}

const IMG_TAG = /<img\b[^>]*>/gi;
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

type Attribute = [name: string, value: string];

function readImageAttributes(tag: string): Attribute[] {
  const body = tag.replace(/^<img\b/i, "").replace(/\/?>$/, "");
  const attributes: Attribute[] = [];
  for (const match of body.matchAll(ATTRIBUTE)) {
    const name = (match[1] ?? "").toLowerCase();
    if (!name) continue;
    attributes.push([name, decodeMailHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "")]);
  }
  return attributes;
}

function writeImageTag(attributes: Attribute[]): string {
  const written = attributes.map(([name, value]) => ` ${name}="${escapeComposeHtml(value)}"`);
  return `<img${written.join("")}>`;
}

function attributeOf(attributes: Attribute[], name: string): string | null {
  return attributes.find(([key]) => key === name)?.[1] ?? null;
}

function withAttribute(attributes: Attribute[], name: string, value: string | null): Attribute[] {
  const rest = attributes.filter(([key]) => key !== name);
  if (value === null) return rest;
  const index = attributes.findIndex(([key]) => key === name);
  if (index === -1) return [...rest, [name, value]];
  return [...rest.slice(0, index), [name, value], ...rest.slice(index)];
}

/** Swaps each `cid:` image for the placeholder, keeping its content id in `data-cid`. */
export function markComposeCidImages(html: string): string {
  if (!/cid:/i.test(html)) return html;
  return html.replace(IMG_TAG, (tag) => {
    const attributes = readImageAttributes(tag);
    const src = attributeOf(attributes, "src") ?? "";
    if (!/^cid:/i.test(src) || !src.slice(4)) return tag;
    const cid = attributeOf(attributes, "data-cid") ?? src.slice(4);
    return writeImageTag(withAttribute(withAttribute(attributes, "data-cid", cid), "src", INLINE_IMAGE_PLACEHOLDER));
  });
}

/** Puts loaded images in place of their placeholders (or leftover `cid:` sources). */
export function replaceInlineImagePlaceholders(html: string, cidToDataUrl: ReadonlyMap<string, string>): string {
  if (!html || cidToDataUrl.size === 0 || !html.includes("data-cid")) return html;
  return html.replace(IMG_TAG, (tag) => {
    const attributes = readImageAttributes(tag);
    const cid = attributeOf(attributes, "data-cid");
    const dataUrl = cid ? cidToDataUrl.get(cid) : undefined;
    const src = attributeOf(attributes, "src") ?? "";
    if (!dataUrl || (src !== INLINE_IMAGE_PLACEHOLDER && !/^cid:/i.test(src))) return tag;
    return writeImageTag(withAttribute(attributes, "src", dataUrl));
  });
}

/** Removes the placeholders of quoted images that could not be loaded, so they never hold up a send. */
export function dropInlineImagePlaceholders(html: string, cids: ReadonlySet<string>): string {
  if (!html || cids.size === 0 || !html.includes("data-cid")) return html;
  return html.replace(IMG_TAG, (tag) => {
    const attributes = readImageAttributes(tag);
    const cid = attributeOf(attributes, "data-cid");
    return cid && cids.has(cid) && attributeOf(attributes, "src") === INLINE_IMAGE_PLACEHOLDER ? "" : tag;
  });
}

export function htmlHasUnhydratedInlinePlaceholders(html: string): boolean {
  return html.includes("data-cid") && html.includes(INLINE_IMAGE_PLACEHOLDER);
}

type ComposeInlineImagePart = {
  cid: string;
  filename: string;
  contentType: string;
  content: Uint8Array;
};

const DATA_IMAGE_URL = /^data:(image\/(?:png|gif|jpe?g|webp|bmp|avif));base64,([a-z0-9+/=\s]+)$/i;

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function imageFilename(alt: string | null, contentType: string, index: number): string {
  const name = alt?.trim().replace(/[\r\n\t"\\/]+/g, " ").slice(0, 120);
  if (name && /\.[a-z0-9]{2,5}$/i.test(name)) return name;
  const extension = contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "img";
  return `${name || `image-${index + 1}`}.${extension}`;
}

/** Every embedded `data:` image becomes a `cid:` reference plus its decoded part; placeholders and remote images stay. */
export function extractComposeInlineImages(
  html: string,
  createCid: () => string,
): { html: string; images: ComposeInlineImagePart[] } {
  const images: ComposeInlineImagePart[] = [];
  if (!/<img\b/i.test(html)) return { html, images };
  const byCid = new Map<string, ComposeInlineImagePart>();
  const rewritten = html.replace(IMG_TAG, (tag) => {
    const attributes = readImageAttributes(tag);
    const src = attributeOf(attributes, "src") ?? "";
    const match = src === INLINE_IMAGE_PLACEHOLDER ? null : DATA_IMAGE_URL.exec(src);
    if (!match) return tag;
    const cid = attributeOf(attributes, "data-cid") || createCid();
    if (!byCid.has(cid)) {
      const contentType = (match[1] ?? "image/png").toLowerCase();
      const part = {
        cid,
        contentType,
        filename: imageFilename(attributeOf(attributes, "alt"), contentType, byCid.size),
        content: decodeBase64(match[2] ?? ""),
      };
      byCid.set(cid, part);
      images.push(part);
    }
    return writeImageTag(withAttribute(withAttribute(attributes, "data-cid", null), "src", `cid:${cid}`));
  });
  return { html: rewritten, images };
}

const DROPPED_CONTENT = /<!--[\s\S]*?(?:-->|$)|<(script|style|head|title)\b[\s\S]*?(?:<\/\1\s*>|$)/gi;
const TOKEN = /<\/?[a-z][^>]*(?:>|$)|<[!?][^>]*(?:>|$)|[^<]+|</gi;
const PARAGRAPH_TAGS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "table", "ul", "ol", "pre", "blockquote"]);
const LINE_TAGS = new Set(["tr", "li", "dt", "dd", "section", "article", "header", "footer", "center", "address", "figure", "figcaption", "details", "summary"]);

/** Deeper quotes and lists keep this prefix, so hostile nesting cannot grow the text quadratically. */
const MAX_PLAIN_TEXT_DEPTH = 8;

type ListFrame = { ordered: boolean; next: number };
type LinkFrame = { href: string; start: number };
type QuoteMarker = "plain" | "reply" | "forward";

function quoteMarkerOf(divTag: string): QuoteMarker {
  if (!/\bdata-quoted-html\b/i.test(divTag)) return "plain";
  return /\bdata-quoted-html\s*=\s*["']?forward/i.test(divTag) ? "forward" : "reply";
}

/** The text/plain alternative of compose HTML: `>`-quoted replies, list markers, link targets and the `-- ` signature line survive. */
export function composeHtmlToPlainText(html: string): string {
  const lines: Array<{ depth: number; text: string }> = [{ depth: 0, text: "" }];
  const lists: ListFrame[] = [];
  const links: LinkFrame[] = [];
  const divs: QuoteMarker[] = [];
  let depth = 0;
  let pre = 0;
  let pendingBlank = false;

  const current = () => lines[lines.length - 1] ?? { depth, text: "" };
  const breakLine = () => {
    if (!current().text.trim() && lines.length > 0 && current().depth === depth) {
      current().text = "";
      return;
    }
    lines.push({ depth, text: "" });
  };
  const blankLine = () => {
    breakLine();
    pendingBlank = true;
  };
  const write = (text: string) => {
    if (!text) return;
    if (pendingBlank) {
      const last = lines[lines.length - 2];
      if (last && last.text.trim()) lines.splice(lines.length - 1, 0, { depth: Math.min(depth, last.depth), text: "" });
      pendingBlank = false;
    }
    const line = current();
    if (line.depth !== depth && !line.text) line.depth = depth;
    line.text += text;
  };

  for (const [token] of html.replace(DROPPED_CONTENT, "").matchAll(TOKEN)) {
    if (!token.startsWith("<") || token === "<") {
      const decoded = decodeMailHtmlEntities(token).replace(/ /g, " ");
      if (pre > 0) {
        decoded.split("\n").forEach((part, index) => {
          if (index > 0) breakLine();
          write(part);
        });
      } else {
        const collapsed = decoded.replace(/\s+/g, " ");
        write(current().text && !current().text.endsWith(" ") ? collapsed : collapsed.replace(/^ /, ""));
      }
      continue;
    }
    const name = (/^<\/?([a-z][a-z0-9]*)/i.exec(token)?.[1] ?? "").toLowerCase();
    if (!name) continue;
    const closing = token.charAt(1) === "/";
    if (name === "br") {
      breakLine();
      continue;
    }
    if (name === "hr") {
      blankLine();
      write("----------");
      blankLine();
      continue;
    }
    if (name === "img") {
      const alt = attributeOf(readImageAttributes(token), "alt")?.trim();
      if (alt) write(`[${alt}]`);
      continue;
    }
    if (name === "a") {
      if (!closing) {
        const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(token);
        links.push({ href: decodeMailHtmlEntities(href?.[1] ?? href?.[2] ?? href?.[3] ?? ""), start: current().text.length });
        continue;
      }
      const link = links.pop();
      if (!link?.href || /^(?:#|javascript:)/i.test(link.href)) continue;
      const label = current().text.slice(link.start).trim();
      const target = link.href.replace(/^(?:mailto:|https?:\/\/)/i, "").replace(/\/$/, "");
      if (label && label !== target && label !== link.href) write(` <${link.href}>`);
      else if (!label) write(link.href);
      continue;
    }
    if (name === "td" || name === "th") {
      if (!closing && current().text.trim()) write("\t");
      continue;
    }
    if (name === "div") {
      const marker = closing ? (divs.pop() ?? "plain") : quoteMarkerOf(token);
      if (!closing) divs.push(marker);
      if (marker === "plain") {
        breakLine();
        continue;
      }
      blankLine();
      if (marker === "reply") depth = Math.max(0, depth + (closing ? -1 : 1));
      breakLine();
      continue;
    }
    if (name === "blockquote") {
      blankLine();
      depth = Math.max(0, depth + (closing ? -1 : 1));
      breakLine();
      continue;
    }
    if (name === "ul" || name === "ol") {
      if (closing) lists.pop();
      else lists.push({ ordered: name === "ol", next: 1 });
      if (lists.length === (closing ? 0 : 1)) blankLine();
      else breakLine();
      continue;
    }
    if (name === "li") {
      breakLine();
      if (closing) continue;
      const list = lists[lists.length - 1];
      const indent = "  ".repeat(Math.min(MAX_PLAIN_TEXT_DEPTH, Math.max(0, lists.length - 1)));
      const marker = list?.ordered ? `${list.next++}. ` : "- ";
      write(`${indent}${marker}`);
      continue;
    }
    if (name === "pre") {
      pre = Math.max(0, pre + (closing ? -1 : 1));
      blankLine();
      continue;
    }
    if (PARAGRAPH_TAGS.has(name)) {
      blankLine();
      continue;
    }
    if (LINE_TAGS.has(name)) breakLine();
  }

  // One blank line at most, none after the `-- ` delimiter (the signature follows on the next line) and none at the ends.
  const compact: typeof lines = [];
  for (const line of lines) {
    const previous = compact[compact.length - 1];
    if (line.text.trim()) {
      if (previous && !previous.text.trim()) previous.depth = Math.min(previous.depth, line.depth);
      compact.push(line);
    } else if (previous && previous.text !== "-- ") {
      if (previous.text.trim()) compact.push({ depth: line.depth, text: "" });
      else previous.depth = Math.min(previous.depth, line.depth);
    }
  }
  while (compact.length > 0 && !compact[compact.length - 1]?.text.trim()) compact.pop();
  return compact
    .map(({ depth: level, text }) => {
      const body = text === "-- " ? text : text.replace(/[ \t]+$/, "");
      return level === 0 ? body : `${"> ".repeat(Math.min(level, MAX_PLAIN_TEXT_DEPTH))}${body}`.replace(/ +$/, body ? "$&" : "");
    })
    .join("\n");
}

/** The draft or send bodies: the HTML and its text/plain alternative, or the plain body alone. */
export function resolveOutgoingComposeBodies(input: {
  body: string;
  htmlBody: string;
}): { textBody: string; htmlBody?: string } {
  const trimmedHtml = input.htmlBody.trim();
  return {
    textBody: (trimmedHtml ? composeHtmlToPlainText(trimmedHtml) : "") || input.body.trim(),
    htmlBody: trimmedHtml || undefined,
  };
}

/** Encrypted mail carries its images inside the HTML, which the reader shows only up to its HTML limit. */
export function getEmbeddedImagesSizeError(html: string | undefined): string | null {
  if (!html || html.length <= MAX_MAIL_DISPLAY_HTML_CHARACTERS || !/<img\b[^>]*\bsrc=["']?data:/i.test(html)) return null;
  return "The images in this message are too large to send encrypted. Use smaller images or attach them as files.";
}

/** The Sent copy keeps its images embedded, because the reader drops the cid parts of decrypted mail; past the reader's HTML limit it falls back to the sent parts. */
export function selfCopyWithEmbeddedImages<T extends { html?: string }>(sent: T, embeddedHtml: string | undefined): T {
  if (!embeddedHtml || embeddedHtml === sent.html || embeddedHtml.length > MAX_MAIL_DISPLAY_HTML_CHARACTERS) return sent;
  return { ...sent, html: embeddedHtml };
}
