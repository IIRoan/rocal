export type TextSelection = {
  start: number;
  end: number;
};

function orderedSelection(selection: TextSelection): TextSelection {
  return {
    start: Math.max(0, Math.min(selection.start, selection.end)),
    end: Math.max(0, Math.max(selection.start, selection.end)),
  };
}

function wrapWith(
  text: string,
  selection: TextSelection,
  open: string,
  close: string,
): { text: string; selection: TextSelection } {
  const { start, end } = orderedSelection(selection);
  const selected = text.slice(start, end);
  const next = `${text.slice(0, start)}${open}${selected}${close}${text.slice(end)}`;
  const caret = start + open.length + selected.length + close.length;
  return { text: next, selection: { start: caret, end: caret } };
}

/** Wrap the current selection in markdown-lite bold markers. */
export function applyComposeBold(
  text: string,
  selection: TextSelection,
): { text: string; selection: TextSelection } {
  return wrapWith(text, selection, "**", "**");
}

/** Wrap the current selection in markdown-lite italic markers. */
export function applyComposeItalic(
  text: string,
  selection: TextSelection,
): { text: string; selection: TextSelection } {
  return wrapWith(text, selection, "_", "_");
}

/** Wrap the current selection in markdown-lite underline markers. */
export function applyComposeUnderline(
  text: string,
  selection: TextSelection,
): { text: string; selection: TextSelection } {
  return wrapWith(text, selection, "__", "__");
}

/** Prefix selected lines with `- `, or strip that prefix when already a list. */
export function toggleComposeList(
  text: string,
  selection: TextSelection,
): { text: string; selection: TextSelection } {
  const { start, end } = orderedSelection(selection);
  const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const lineEndIndex = text.indexOf("\n", end);
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
  const block = text.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  const isList = lines.every((line) => line.length === 0 || line.startsWith("- "));
  const nextLines = lines.map((line) => {
    if (!line) return line;
    return isList ? line.replace(/^- /, "") : `- ${line}`;
  });
  const nextBlock = nextLines.join("\n");
  const next = `${text.slice(0, lineStart)}${nextBlock}${text.slice(lineEnd)}`;
  return {
    text: next,
    selection: {
      start: lineStart,
      end: lineStart + nextBlock.length,
    },
  };
}

export function hasComposeFormatting(text: string): boolean {
  return /(\*\*|__|_(?!\s)|^- )/m.test(text);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function applyInlineMarkdown(escaped: string): string {
  return escaped
    .replace(/__([^_\n]+)__/g, "<u>$1</u>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?;:])/g, "$1<em>$2</em>");
}

/** Convert markdown-lite compose text into simple HTML for JMAP htmlBody. */
export function composeTextToHtml(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").trimEnd();
  if (!normalized.trim()) {
    return "";
  }

  const blocks = normalized.split(/\n{2,}/);
  const htmlBlocks = blocks.map((block) => {
    const lines = block.split("\n");
    const isList = lines.every((line) => line.length === 0 || line.startsWith("- "));
    if (isList && lines.some((line) => line.startsWith("- "))) {
      const items = lines
        .filter((line) => line.startsWith("- "))
        .map((line) => `<li>${applyInlineMarkdown(escapeHtml(line.slice(2)))}</li>`)
        .join("");
      return `<ul>${items}</ul>`;
    }
    return `<p>${applyInlineMarkdown(escapeHtml(block)).replace(/\n/g, "<br>")}</p>`;
  });

  return htmlBlocks.join("");
}

/** Strip compose markdown-lite markers for the plaintext MIME part. */
export function composeTextToPlain(text: string): string {
  return text
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?;:])/g, "$1$2");
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  nbsp: " ",
  apos: "'",
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(String(code), 16)),
    )
    .replace(/&([a-z]+);/gi, (match, name: string) => {
      return HTML_ENTITIES[name.toLowerCase()] ?? match;
    });
}

function styleAttr(attributes: string): string {
  const match = attributes.match(/style\s*=\s*(["'])([\s\S]*?)\1/i);
  return match?.[2] ?? "";
}

function wrapStyledHtml(html: string): string {
  let current = html;
  for (let pass = 0; pass < 6; pass += 1) {
    const next = current.replace(
      /<(span|font)\b([^>]*)>([\s\S]*?)<\/\1>/gi,
      (_full, _tag: string, attributes: string, inner: string) => {
        const style = `${attributes} ${styleAttr(attributes)}`;
        let wrapped = inner;
        const hasBold = /font-weight\s*:\s*(bold|[6-9]00)/i.test(style);
        const hasItalic = /font-style\s*:\s*italic/i.test(style);
        const hasUnderline = /text-decoration[^;]*underline/i.test(style);
        if (!hasBold && !hasItalic && !hasUnderline) {
          return inner;
        }
        if (hasBold) wrapped = `**${wrapped}**`;
        if (hasItalic) wrapped = `_${wrapped}_`;
        if (hasUnderline) wrapped = `__${wrapped}__`;
        return wrapped;
      },
    );
    if (next === current) break;
    current = next;
  }
  return current;
}

/**
 * Convert editor / draft HTML back into native compose markdown-lite.
 * Handles `<strong>`/`<b>`, `<em>`/`<i>`, `<u>`, lists, and execCommand spans.
 */
export function htmlToComposeText(html: string): string {
  if (!html.trim()) return "";

  let value = html.replace(/\r\n/g, "\n");
  value = value.replace(/<script[\s\S]*?<\/script>/gi, "");
  value = value.replace(/<style[\s\S]*?<\/style>/gi, "");
  value = wrapStyledHtml(value);
  value = value.replace(/<(strong|b)(\s[^>]*)?>/gi, "**");
  value = value.replace(/<\/(strong|b)>/gi, "**");
  value = value.replace(/<(em|i)(\s[^>]*)?>/gi, "_");
  value = value.replace(/<\/(em|i)>/gi, "_");
  value = value.replace(/<u(\s[^>]*)?>/gi, "__");
  value = value.replace(/<\/u>/gi, "__");
  value = value.replace(/<br\s*\/?>/gi, "\n");
  value = value.replace(/<\/p>/gi, "\n\n");
  value = value.replace(/<\/div>/gi, "\n");
  value = value.replace(/<\/h[1-6]>/gi, "\n\n");
  value = value.replace(/<li[^>]*>/gi, "- ");
  value = value.replace(/<\/li>/gi, "\n");
  value = value.replace(/<\/(ul|ol)>/gi, "\n");
  value = value.replace(/<[^>]+>/g, "");
  value = decodeHtmlEntities(value);
  return value.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Prefer markdown-lite text, otherwise recover formatting from HTML drafts. */
export function messageBodiesToComposeText(bodies: {
  text?: string | null;
  html?: string | null;
}): string {
  const text = bodies.text?.trim() ?? "";
  const html = bodies.html?.trim() ?? "";
  if (hasComposeFormatting(text)) return text;
  if (html) return htmlToComposeText(html);
  return text;
}

/**
 * Resolve the plaintext + optional HTML parts native compose sends.
 * HTML is only produced when the body has formatting and the message is not encrypted.
 */
export function resolveComposeSendBodies(input: {
  body: string;
  bodyWithSignature: string;
  encrypted: boolean;
}): { plaintext: string; htmlBody?: string } {
  const formatted = hasComposeFormatting(input.body);
  const plaintext = formatted
    ? composeTextToPlain(input.bodyWithSignature)
    : input.bodyWithSignature;
  const htmlBody =
    formatted && !input.encrypted
      ? composeTextToHtml(input.bodyWithSignature)
      : undefined;
  return htmlBody ? { plaintext, htmlBody } : { plaintext };
}
