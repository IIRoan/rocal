import { decodeHtmlEntities } from "../html-text";
import { decodeCssEscapes } from "../sanitize-email-html";

/** Formatting elements a script-less reader can render; written out here so the oracle never trusts the sanitizer's own list. */
const SAFE_TAGS = new Set([
  "a", "abbr", "address", "article", "aside", "b", "bdi", "bdo", "big", "blockquote", "br", "caption",
  "center", "cite", "code", "col", "colgroup", "dd", "del", "details", "dfn", "div", "dl", "dt", "em",
  "figcaption", "figure", "font", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "i", "img",
  "ins", "kbd", "li", "main", "mark", "nav", "ol", "p", "pre", "q", "rp", "rt", "ruby", "s", "samp",
  "section", "small", "span", "strike", "strong", "sub", "summary", "sup", "table", "tbody", "td", "tfoot",
  "th", "thead", "time", "tr", "tt", "u", "ul", "wbr",
]);
const URL_ATTRIBUTES = new Set(["href", "src", "background", "cite"]);
const SAFE_SCHEMES = new Set(["http", "https", "mailto", "cid"]);
const SAFE_IMAGE_DATA = /^data:image\/(?:png|gif|jpe?g|webp|bmp|avif)[;,]/;
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function isUnsafeUrl(tag: string, name: string, raw: string): boolean {
  // eslint-disable-next-line no-control-regex
  const value = decodeHtmlEntities(raw).replace(/[\x00-\x20\x7f-\x9f\s]+/g, "").toLowerCase();
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(value)?.[1];
  if (!scheme || SAFE_SCHEMES.has(scheme)) return false;
  if (scheme === "tel") return name !== "href";
  return !(tag === "img" && name === "src" && (scheme === "blob" || SAFE_IMAGE_DATA.test(value)));
}

function isUnsafeCss(css: string): boolean {
  const normalized = decodeCssEscapes(css).replace(/\s+/g, "").toLowerCase();
  return /expression\(|-moz-binding|javascript:/.test(normalized);
}

/** Why one element with its attributes could run script or reach out, or an empty list when it is safe. */
export function unsafeElementReasons(
  tag: string,
  attributes: Array<[string, string]>,
  profile: "reader" | "compose",
): string[] {
  const reasons: string[] = [];
  if (!SAFE_TAGS.has(tag) && !(tag === "style" && profile === "reader")) reasons.push(`tag <${tag}>`);
  for (const [name, value] of attributes) {
    if (/^on/.test(name) || ["srcset", "formaction", "xlink:href"].includes(name)) reasons.push(`attribute ${name}`);
    if (URL_ATTRIBUTES.has(name) && isUnsafeUrl(tag, name, value)) reasons.push(`${name}=${value}`);
    if (name === "style" && isUnsafeCss(decodeHtmlEntities(value))) reasons.push(`style=${value}`);
  }
  return reasons;
}

/** Scans serialized sanitizer output, whose attribute values never hold a raw `>`, for anything unsafe. */
export function unsafeMarkupReasons(html: string, profile: "reader" | "compose"): string[] {
  const reasons: string[] = [];
  for (const [, rawTag = "", rawAttributes = ""] of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
    const attributes = [...rawAttributes.matchAll(ATTRIBUTE)].map(
      ([, name = "", double, single, bare]): [string, string] => [name.toLowerCase(), double ?? single ?? bare ?? ""],
    );
    reasons.push(...unsafeElementReasons(rawTag.toLowerCase(), attributes, profile));
  }
  for (const [, css = ""] of html.matchAll(/<style\b[^>]*>([\s\S]*?)(?:<\/style\s*>|$)/gi)) {
    if (isUnsafeCss(css)) reasons.push(`style block ${css}`);
  }
  return reasons;
}
