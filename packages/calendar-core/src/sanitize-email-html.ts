import DOMPurify from "dompurify";

export interface SanitizeEmailHtmlOptions {
  /** "reader" keeps `<style>` only because it renders in a script-less sandboxed frame. */
  profile?: "compose" | "reader";
}

/** Shared by the DOM and non-DOM paths so both drop everything unlisted identically. */
const ALLOWED_TAGS = [
  "a", "abbr", "address", "article", "aside", "b", "bdi", "bdo", "big",
  "blockquote", "br", "caption", "center", "cite", "code", "col", "colgroup",
  "dd", "del", "details", "dfn", "div", "dl", "dt", "em", "figcaption",
  "figure", "font", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header",
  "hr", "i", "img", "ins", "kbd", "li", "main", "mark", "nav", "ol", "p", "pre",
  "q", "rp", "rt", "ruby", "s", "samp", "section", "small", "span", "strike",
  "strong", "sub", "summary", "sup", "table", "tbody", "td", "tfoot", "th",
  "thead", "time", "tr", "tt", "u", "ul", "wbr",
] as const;

const ALLOWED_ATTRS = [
  "abbr", "align", "alt", "background", "bgcolor", "border", "cellpadding",
  "cellspacing", "cite", "class", "color", "colspan", "datetime", "dir", "face",
  "headers", "height", "href", "hspace", "lang", "nowrap", "reversed", "role",
  "rowspan", "rules", "scope", "size", "span", "src", "start", "style",
  "summary", "title", "type", "valign", "value", "vspace", "width",
] as const;

/** Elements whose entire content is discarded, not just the tag. */
const DROP_WITH_CONTENT_TAGS = new Set([
  "script", "style", "template", "iframe", "frame", "frameset", "object",
  "embed", "applet", "noscript", "noembed", "noframes", "textarea", "select",
  "title", "xmp", "svg", "math", "head",
]);

const VOID_TAGS = new Set(["br", "col", "hr", "img", "wbr"]);

const URL_ATTRS = new Set(["href", "src", "background", "cite"]);

const ALLOWED_TAG_SET = new Set<string>(ALLOWED_TAGS);
const ALLOWED_ATTR_SET = new Set<string>(ALLOWED_ATTRS);

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  colon: ":",
  gt: ">",
  lpar: "(",
  lt: "<",
  newline: "\n",
  nbsp: " ",
  quot: '"',
  rpar: ")",
  sol: "/",
  tab: "\t",
};

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));?/gi,
    (match, hex: string | undefined, dec: string | undefined, name: string | undefined) => {
      if (hex || dec) {
        const code = Number.parseInt(hex ?? dec ?? "", hex ? 16 : 10);
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
        return String.fromCodePoint(code);
      }
      return NAMED_ENTITIES[(name ?? "").toLowerCase()] ?? match;
    },
  );
}

/** Browsers ignore whitespace/control chars inside schemes (`java\tscript:`), so strip them first. */
export function isSafeEmailUrl(tag: string, attr: string, rawValue: string): boolean {
  // eslint-disable-next-line no-control-regex
  const value = rawValue.replace(/[\x00- \x7f-\x9f\s]+/g, "").toLowerCase();
  if (!value) return true;

  const schemeMatch = value.match(/^([^/?#]*?):/);
  if (!schemeMatch) return true;
  const scheme = schemeMatch[1];

  if (attr === "href") {
    return scheme === "http" || scheme === "https" || scheme === "mailto" || scheme === "tel";
  }
  if (attr === "src" && tag === "img") {
    if (scheme === "data") return /^data:image\/(?:png|gif|jpe?g|webp|bmp|avif)[;,]/.test(value);
    return scheme === "http" || scheme === "https" || scheme === "cid" || scheme === "blob";
  }
  if (attr === "background") {
    return scheme === "http" || scheme === "https" || scheme === "cid";
  }
  return scheme === "http" || scheme === "https";
}

function decodeCssEscapes(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?(?:\*\/|$)/g, "")
    .replace(/\\([0-9a-f]{1,6})\s?/gi, (_m, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/\\(.)/g, "$1");
}

/** Legacy script-in-CSS vectors (IE expression/behavior, XBL, script URLs). */
export function isDangerousCss(css: string): boolean {
  const normalized = decodeCssEscapes(css).replace(/\s+/g, "").toLowerCase();
  return /expression\(|javascript:|vbscript:|-moz-binding|behavior:|livescript:/.test(normalized);
}

function escapeAttributeValue(value: string): string {
  return value.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isAllowedAttributeName(name: string): boolean {
  return ALLOWED_ATTR_SET.has(name) || /^data-[a-z0-9_.-]+$/.test(name) || /^aria-[a-z]+$/.test(name);
}

type ParsedTag = {
  name: string;
  closing: boolean;
  attrs: Array<[string, string]>;
  end: number;
};

const ATTR_PATTERN = /[\s/]*([^\s/>"'=][^\s/>"'=]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/y;

/** Tokenize one tag starting at `<`, following the HTML attribute grammar. */
function parseTag(html: string, start: number): ParsedTag | null {
  const nameMatch = /<(\/?)([a-z][^\s/>]*)/iy;
  nameMatch.lastIndex = start;
  const head = nameMatch.exec(html);
  if (!head) return null;

  const attrs: Array<[string, string]> = [];
  let index = nameMatch.lastIndex;
  while (index < html.length) {
    const whitespace = /[\s/]*/y;
    whitespace.lastIndex = index;
    whitespace.exec(html);
    index = whitespace.lastIndex;
    if (html[index] === ">") {
      return {
        name: (head[2] ?? "").toLowerCase(),
        closing: head[1] === "/",
        attrs,
        end: index + 1,
      };
    }
    ATTR_PATTERN.lastIndex = index;
    const attr = ATTR_PATTERN.exec(html);
    if (!attr || ATTR_PATTERN.lastIndex === index) {
      // Stray quote or `=`: skip one character, as the HTML tokenizer does.
      index += 1;
      continue;
    }
    index = ATTR_PATTERN.lastIndex;
    attrs.push([(attr[1] ?? "").toLowerCase(), attr[2] ?? attr[3] ?? attr[4] ?? ""]);
  }
  return null;
}

function indexOfClosingTag(html: string, tag: string, from: number): number {
  const pattern = new RegExp(`</${tag}[\\s/>]`, "ig");
  pattern.lastIndex = from;
  const match = pattern.exec(html);
  return match ? match.index : -1;
}

function skipPastClosingTag(html: string, tag: string, from: number): number {
  const closeIndex = indexOfClosingTag(html, tag, from);
  if (closeIndex === -1) return html.length;
  const end = html.indexOf(">", closeIndex);
  return end === -1 ? html.length : end + 1;
}

function serializeAttributes(tag: string, attrs: Array<[string, string]>, reader: boolean): string {
  const seen = new Set<string>();
  let out = "";
  for (const [name, rawValue] of attrs) {
    if (seen.has(name) || !isAllowedAttributeName(name)) continue;
    const decoded = decodeHtmlEntities(rawValue);
    if (URL_ATTRS.has(name) && !isSafeEmailUrl(tag, name, decoded)) continue;
    if (name === "style" && isDangerousCss(decoded)) continue;
    seen.add(name);
    out += ` ${name}="${escapeAttributeValue(rawValue)}"`;
  }
  if (reader && tag === "a" && seen.has("href")) {
    out += ' target="_blank" rel="noopener noreferrer"';
  }
  return out;
}

/** Every emitted tag is re-serialized from parsed parts, so malformed input cannot smuggle handlers. */
function sanitizeWithoutDom(input: string, reader: boolean): string {
  // eslint-disable-next-line no-control-regex
  const html = input.replace(/\x00/g, "");
  let out = "";
  let index = 0;

  while (index < html.length) {
    const lt = html.indexOf("<", index);
    if (lt === -1) {
      out += html.slice(index);
      break;
    }
    out += html.slice(index, lt);

    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      index = end === -1 ? html.length : end + 3;
      continue;
    }
    if (/^<[!?]/.test(html.slice(lt, lt + 2)) || /^<\/[^a-z]/i.test(html.slice(lt, lt + 3))) {
      const end = html.indexOf(">", lt + 1);
      index = end === -1 ? html.length : end + 1;
      continue;
    }

    const tag = parseTag(html, lt);
    if (!tag) {
      out += "&lt;";
      index = lt + 1;
      continue;
    }
    index = tag.end;

    if (tag.name === "plaintext") {
      break;
    }

    if (tag.name === "style" && reader && !tag.closing) {
      const closeIndex = indexOfClosingTag(html, "style", index);
      const css = html.slice(index, closeIndex === -1 ? html.length : closeIndex);
      if (!isDangerousCss(css)) out += `<style>${css}</style>`;
      index = skipPastClosingTag(html, "style", index);
      continue;
    }

    if (DROP_WITH_CONTENT_TAGS.has(tag.name)) {
      if (!tag.closing) index = skipPastClosingTag(html, tag.name, index);
      continue;
    }

    if (!ALLOWED_TAG_SET.has(tag.name)) continue;

    if (tag.closing) {
      if (!VOID_TAGS.has(tag.name)) out += `</${tag.name}>`;
      continue;
    }
    out += `<${tag.name}${serializeAttributes(tag.name, tag.attrs, reader)}>`;
  }

  return out;
}

type DomPurifyInstance = ReturnType<typeof DOMPurify>;

let domPurify: DomPurifyInstance | null | undefined;
let activeReaderProfile = false;

function getDomPurify(): DomPurifyInstance | null {
  if (domPurify !== undefined) return domPurify;
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return null;
  }
  const instance = DOMPurify(window);
  if (!instance.isSupported) {
    domPurify = null;
    return null;
  }

  instance.addHook("uponSanitizeAttribute", (node, data) => {
    const tag = node.nodeName.toLowerCase();
    if (URL_ATTRS.has(data.attrName) && !isSafeEmailUrl(tag, data.attrName, data.attrValue)) {
      data.keepAttr = false;
    }
    if (data.attrName === "style" && isDangerousCss(data.attrValue)) {
      data.keepAttr = false;
    }
  });
  instance.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName === "style" && isDangerousCss(node.textContent ?? "")) {
      node.textContent = "";
    }
  });
  instance.addHook("afterSanitizeAttributes", (node) => {
    if (activeReaderProfile && node.nodeName === "A" && node instanceof Element && node.hasAttribute("href")) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });

  domPurify = instance;
  return instance;
}

/** DOMPurify when a DOM exists, else the tokenizer below, with the same tag/attribute/URL policy. */
export function sanitizeUntrustedEmailHtml(
  html: string,
  options: SanitizeEmailHtmlOptions = {},
): string {
  if (!html.trim()) {
    return "";
  }
  const reader = options.profile === "reader";

  const purifier = getDomPurify();
  if (!purifier) {
    return sanitizeWithoutDom(html, reader);
  }

  activeReaderProfile = reader;
  try {
    return purifier.sanitize(html, {
      ALLOWED_TAGS: reader ? [...ALLOWED_TAGS, "style"] : [...ALLOWED_TAGS],
      ALLOWED_ATTR: [...ALLOWED_ATTRS],
      ALLOW_DATA_ATTR: true,
      ALLOW_ARIA_ATTR: true,
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|cid|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
      FORBID_CONTENTS: [...DROP_WITH_CONTENT_TAGS],
      FORCE_BODY: true,
      RETURN_TRUSTED_TYPE: false,
    });
  } finally {
    activeReaderProfile = false;
  }
}
