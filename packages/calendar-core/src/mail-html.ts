import {
  decodeCssEscapes,
  decodeHtmlEntities,
  sanitizeUntrustedEmailHtml,
} from "./sanitize-email-html";

export interface ProcessEmailHtmlOptions {
  html: string;
  isDark: boolean;
  blockTrackingPixels: boolean;
  blockRemoteImages?: boolean;
  /** Dark canvas that email whites are translated onto; defaults to the reader canvas. */
  canvasColor?: string;
}

export interface BuildEmailHtmlDocumentOptions {
  processedHtml: string;
  isDark: boolean;
  blockRemoteImages: boolean;
  mobileViewport?: boolean;
  /** Page background behind the message; defaults to the reader canvas. */
  canvasColor?: string;
  /** Drops the page padding when the host already insets the message. */
  flush?: boolean;
}

const DARK_CANVAS = "#1a1a1a";
const DARK_TEXT = "#e0e0e0";
const DARK_SCHEME_PATTERN = /prefers-color-scheme\s*:\s*dark/i;
const DARK_MEDIA_BLOCK_PATTERN =
  /@media[^{]*prefers-color-scheme\s*:\s*dark[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/gi;
const COLOR_DECLARATION_PATTERN =
  /((?:^|[\s;{])(color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?)\s*:)([^;}]*)/gi;
const COLOR_TOKEN_PATTERN =
  /url\([^)]*\)|#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|rgba?\([^)]*\)|\b[a-z]+\b/gi;
const STYLE_ATTRIBUTE_VALUE_PATTERN = /(\sstyle\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi;
const COLOR_ATTRIBUTE_VALUE_PATTERN =
  /(\s(bgcolor|color)\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
const MARKUP_TOKEN_PATTERN =
  /<!--[\s\S]*?-->|<(\/?)([a-z][a-z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/gi;
const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr",
]);
const MIN_TEXT_CONTRAST = 4.5;
const NAMED_COLORS: Record<string, [number, number, number]> = {
  white: [255, 255, 255],
  black: [0, 0, 0],
  windowtext: [0, 0, 0],
  whitesmoke: [245, 245, 245],
  gainsboro: [220, 220, 220],
  lightgray: [211, 211, 211],
  lightgrey: [211, 211, 211],
  silver: [192, 192, 192],
  darkgray: [169, 169, 169],
  darkgrey: [169, 169, 169],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  dimgray: [105, 105, 105],
  dimgrey: [105, 105, 105],
};

type Rgba = [number, number, number, number];

function parseCssColor(token: string): Rgba | null {
  const value = token.toLowerCase();
  const named = NAMED_COLORS[value];
  if (named) return [...named, 1];
  if (value.startsWith("#")) {
    const hex = value.length <= 5 ? value.slice(1).replace(/./g, "$&$&") : value.slice(1);
    const channels = hex.match(/../g)?.map((pair) => Number.parseInt(pair, 16)) ?? [];
    const [r = 0, g = 0, b = 0, a = 255] = channels;
    return [r, g, b, a / 255];
  }
  const parts = value.match(/^rgba?\(([^)]*)\)$/)?.[1]?.split(/[\s,/]+/).filter(Boolean);
  if (!parts || parts.length < 3) return null;
  const channel = (part: string, scale: number) =>
    part.endsWith("%") ? (Number.parseFloat(part) / 100) * scale : Number.parseFloat(part);
  const rgba: Rgba = [
    channel(parts[0] ?? "", 255),
    channel(parts[1] ?? "", 255),
    channel(parts[2] ?? "", 255),
    parts[3] === undefined ? 1 : channel(parts[3], 1),
  ];
  return rgba.every(Number.isFinite) ? rgba : null;
}

function toLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function fromLinear(value: number): number {
  const encoded = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, encoded)) * 255);
}

function toOklab(r: number, g: number, b: number): [number, number, number] {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab(lightness: number, a: number, b: number): [number, number, number] {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

type Rgb = [number, number, number];

const WHITE: Rgb = [255, 255, 255];
const CANVAS_LIGHTNESS = toOklab(...(parseCssColor(DARK_CANVAS)?.slice(0, 3) as Rgb))[0];
const TEXT_LIGHTNESS = toOklab(...(parseCssColor(DARK_TEXT)?.slice(0, 3) as Rgb))[0];

function formatColor([r, g, b]: Rgb, alpha: number): string {
  if (alpha < 1) return `rgba(${r}, ${g}, ${b}, ${Number(alpha.toFixed(3))})`;
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function contrastRatio(first: Rgb, second: Rgb): number {
  const luminance = ([r, g, b]: Rgb) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  const [light, dark] = [luminance(first), luminance(second)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

/** White lands on the dark canvas and black on the dark text color; hue is kept. */
function invertLightness(rgb: Rgb, canvasLightness = CANVAS_LIGHTNESS): Rgb {
  const [lightness, a, b] = toOklab(...rgb);
  const inverted = canvasLightness + (1 - lightness) * (TEXT_LIGHTNESS - canvasLightness);
  const chroma = lightness > 0 ? Math.min(1, inverted / lightness) : 1;
  return fromOklab(inverted, a * chroma, b * chroma);
}

function canvasLightnessOf(canvas: string | undefined): number {
  const rgb = canvas ? opaqueColor(canvas) : null;
  return rgb ? toOklab(...rgb)[0] : CANVAS_LIGHTNESS;
}

function opaqueColor(token: string): Rgb | null {
  const rgba = parseCssColor(token);
  return rgba && rgba[3] >= 0.5 ? [rgba[0], rgba[1], rgba[2]] : null;
}

/** Translates a background or border color for the dark reader. */
export function darkenCssColor(token: string, canvasLightness = CANVAS_LIGHTNESS): string {
  const rgba = parseCssColor(token);
  return rgba ? formatColor(invertLightness([rgba[0], rgba[1], rgba[2]], canvasLightness), rgba[3]) : token;
}

/** Translates a text color, then walks its lightness away from the translated background until it reaches AA contrast. */
export function darkenTextColor(
  token: string,
  background = "#ffffff",
  canvasLightness = CANVAS_LIGHTNESS,
): string {
  const rgba = parseCssColor(token);
  if (!rgba) return token;
  const darkBackground = invertLightness(opaqueColor(background) ?? WHITE, canvasLightness);
  const inverted = invertLightness([rgba[0], rgba[1], rgba[2]], canvasLightness);
  if (contrastRatio(inverted, darkBackground) >= MIN_TEXT_CONTRAST) return formatColor(inverted, rgba[3]);
  const [lightness, a, b] = toOklab(...inverted);
  const step = contrastRatio(WHITE, darkBackground) >= contrastRatio([0, 0, 0], darkBackground) ? 0.02 : -0.02;
  let candidate = inverted;
  for (let next = lightness + step; next >= 0 && next <= 1; next += step) {
    candidate = fromOklab(next, a, b);
    if (contrastRatio(candidate, darkBackground) >= MIN_TEXT_CONTRAST) break;
  }
  return formatColor(candidate, rgba[3]);
}

function darkenCssColors(css: string, background: string, canvasLightness: number): string {
  return css.replace(
    COLOR_DECLARATION_PATTERN,
    (_match, prefix: string, property: string, value: string) =>
      prefix +
      value.replace(COLOR_TOKEN_PATTERN, (token) => {
        if (token.toLowerCase().startsWith("url(")) return token;
        return property.toLowerCase() === "color"
          ? darkenTextColor(token, background, canvasLightness)
          : darkenCssColor(token, canvasLightness);
      }),
  );
}

function attributeValue(double?: string, single?: string, bare?: string): string {
  return decodeHtmlEntities(double ?? single ?? bare ?? "").trim();
}

function declaredBackground(attributes: string): string | null {
  for (const [, , name = "", ...value] of attributes.matchAll(COLOR_ATTRIBUTE_VALUE_PATTERN)) {
    const token = attributeValue(...value);
    if (name.toLowerCase() === "bgcolor" && opaqueColor(token)) return token;
  }
  for (const [, , double, single] of attributes.matchAll(STYLE_ATTRIBUTE_VALUE_PATTERN)) {
    for (const [, , property = "", value = ""] of attributeValue(double, single).matchAll(COLOR_DECLARATION_PATTERN)) {
      if (!property.toLowerCase().startsWith("background")) continue;
      const token = value.match(COLOR_TOKEN_PATTERN)?.find((candidate) => opaqueColor(candidate));
      if (token) return token;
    }
  }
  return null;
}

function darkenTagColors(tag: string, background: string, canvasLightness: number): string {
  return tag
    .replace(STYLE_ATTRIBUTE_VALUE_PATTERN, (_match, prefix: string, double?: string, single?: string) =>
      double !== undefined
        ? `${prefix}"${darkenCssColors(double, background, canvasLightness)}"`
        : `${prefix}'${darkenCssColors(single ?? "", background, canvasLightness)}'`,
    )
    .replace(
      COLOR_ATTRIBUTE_VALUE_PATTERN,
      (_match, prefix: string, name: string, double?: string, single?: string, bare?: string) => {
        const token = attributeValue(double, single, bare);
        const darkened =
          name.toLowerCase() === "bgcolor"
            ? darkenCssColor(token, canvasLightness)
            : darkenTextColor(token, background, canvasLightness);
        return `${prefix}"${darkened}"`;
      },
    );
}

/** Tracks the background each element paints on so text is translated against it; images keep their own plates. */
function darkenEmailColors(html: string, canvasLightness: number): string {
  const open: { name: string; background: string }[] = [];
  return html
    .replace(STYLE_BLOCK_PATTERN, (block, css: string) => block.replace(css, () => darkenCssColors(css, "#ffffff", canvasLightness)))
    .replace(
      MARKUP_TOKEN_PATTERN,
      (token, closing: string | undefined, rawName: string | undefined, attributes = "", selfClosing = "") => {
        if (!rawName) return token;
        const name = rawName.toLowerCase();
        if (closing) {
          const index = open.map((element) => element.name).lastIndexOf(name);
          if (index >= 0) open.length = index;
          return token;
        }
        if (name === "img") return token;
        const background = declaredBackground(attributes) ?? open.at(-1)?.background ?? "#ffffff";
        if (!VOID_TAGS.has(name) && !selfClosing) open.push({ name, background });
        return darkenTagColors(token, background, canvasLightness);
      },
    );
}

export function processEmailHtml({
  html,
  isDark,
  blockTrackingPixels,
  blockRemoteImages = false,
  canvasColor,
}: ProcessEmailHtmlOptions): string {
  let processed = extractBodyHtml(html);

  if (blockTrackingPixels || blockRemoteImages) {
    processed = processed.replace(/<img\b[^>]*>/gi, (tag) => {
      if (blockRemoteImages && isRemoteImageTag(tag)) return "";
      if (blockTrackingPixels && isTrackingPixelTag(tag)) return "";
      return tag;
    });
  }

  if (isDark && !DARK_SCHEME_PATTERN.test(html)) {
    processed = darkenEmailColors(processed, canvasLightnessOf(canvasColor));
  } else if (!isDark) {
    processed = processed.replace(
      /<meta[^>]*name=["'](?:color-scheme|supported-color-schemes)["'][^>]*\/?>/gi,
      "",
    );
    processed = processed.replace(DARK_MEDIA_BLOCK_PATTERN, "");
  }

  // Always last: nothing after this point may reintroduce untrusted markup.
  return sanitizeUntrustedEmailHtml(processed, { profile: "reader" });
}

/** Remote images are allowed only once the user opted in for this message or sender. */
export function buildEmailContentSecurityPolicy(allowRemoteImages: boolean): string {
  const imgSrc = allowRemoteImages ? "data: blob: cid: https: http:" : "data: blob: cid:";
  return [
    "default-src 'none'",
    "script-src 'none'",
    `img-src ${imgSrc}`,
    "style-src 'unsafe-inline'",
    "font-src data:",
    "connect-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");
}

export function buildEmailHtmlDocument({
  processedHtml,
  isDark,
  blockRemoteImages,
  mobileViewport,
  canvasColor,
  flush,
}: BuildEmailHtmlDocumentOptions): string {
  const csp = `<meta http-equiv="Content-Security-Policy" content="${buildEmailContentSecurityPolicy(!blockRemoteImages)}">`;
  const scheme = isDark ? "dark" : "light";
  const bg = canvasColor ?? (isDark ? DARK_CANVAS : "#fff");
  const fg = isDark ? DARK_TEXT : "#111";
  const linkColor = isDark ? "#8ab4f8" : "#2563eb";
  const quoteBorder = isDark ? "#444" : "#d4d4d4";
  const quoteColor = isDark ? "#9aa0a6" : "#666";
  // Lock in-page pinch zoom on native — the message ScrollView owns zoom/pan so
  // WKWebView/Android WebView cannot steal the gesture with scroll disabled.
  const viewport = mobileViewport
    ? `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">`
    : "";
  // break-word (not anywhere / word-break:break-word): break only over-long
  // tokens, and keep each word's min-content width so table columns are not
  // crushed to a single character (vertical "Qty"/"Total" / stacked €960.00).
  const layoutStyles = `table{max-width:100%;table-layout:auto}td,th{overflow-wrap:break-word;word-break:normal}pre{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;max-width:100%}`;
  const richTextStyles = `ul,ol{margin:0 0 1em;padding-left:1.5em}ul{list-style-type:disc}ol{list-style-type:decimal}li{margin:0.25em 0}li>p{margin:0}blockquote{margin:0 0 1em;padding-left:12px;border-left:3px solid ${quoteBorder};color:${quoteColor}}a{color:${linkColor};text-decoration:underline}u{text-decoration:underline}s,strike,del{text-decoration:line-through}strong,b{font-weight:600}em,i{font-style:italic}`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">${viewport}<meta name="color-scheme" content="${scheme}">${csp}<meta name="referrer" content="no-referrer"><base target="_blank"><style>*{box-sizing:border-box}html,body{margin:0;padding:0;color-scheme:${scheme}}body{background:${bg};font-family:system-ui,-apple-system,"Helvetica Neue",sans-serif;font-size:14px;line-height:1.6;padding:${flush ? "0" : "16px 20px"};color:${fg};overflow-wrap:break-word;overflow-x:hidden}img{max-width:100%;height:auto}${layoutStyles}${richTextStyles}p{margin:0 0 1em}p:last-child{margin:0}</style></head><body>${processedHtml}</body></html>`;
}

function extractBodyHtml(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body\s*>/i);
  if (!bodyMatch) return html;

  const headStyles: string[] = [];
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head\s*>/i);
  const headHtml = headMatch?.[1];
  if (headHtml) {
    const styleMatches = headHtml.matchAll(/<style[^>]*>[\s\S]*?<\/style\s*>/gi);
    for (const match of styleMatches) headStyles.push(match[0]);
  }

  return headStyles.join("") + bodyMatch[1];
}

function isRemoteImageTag(tag: string): boolean {
  return isRemoteUrl(decodeHtmlEntities(getAttribute(tag, "src") ?? ""));
}

/** Browsers ignore whitespace/control chars in URLs and read `\` as `/`, so normalize the same way. */
function isRemoteUrl(value: string): boolean {
  const normalized = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x20\x7f-\x9f]+/g, "")
    .replace(/\\/g, "/")
    .toLowerCase();
  return /^(?:https?:|\/\/)/.test(normalized);
}

/** `@import` and `@font-face` stay blocked by the style-src/font-src policy, so only image URLs count. */
function cssHasRemoteUrl(css: string): boolean {
  const normalized = decodeCssEscapes(css)
    .replace(/@import[^;]*;?/gi, "")
    .replace(/@font-face\s*\{[^}]*\}/gi, "");
  for (const match of normalized.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)) {
    if (isRemoteUrl(match[1] ?? match[2] ?? match[3] ?? "")) return true;
  }
  for (const imageSet of normalized.matchAll(/image-set\(([^)]*)\)/gi)) {
    for (const match of (imageSet[1] ?? "").matchAll(/"([^"]*)"|'([^']*)'/g)) {
      if (isRemoteUrl(match[1] ?? match[2] ?? "")) return true;
    }
  }
  return false;
}

const STYLE_BLOCK_PATTERN = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
const TAG_PATTERN =
  /<([a-z][a-z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/gi;
const ATTRIBUTE_PATTERN = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
const BACKGROUND_ATTRIBUTE_TAGS = new Set([
  "table", "thead", "tbody", "tfoot", "tr", "td", "th",
]);

function sanitizedHtmlHasRemoteContent(html: string): boolean {
  for (const block of html.matchAll(STYLE_BLOCK_PATTERN)) {
    if (cssHasRemoteUrl(block[1] ?? "")) return true;
  }
  const markup = html.replace(STYLE_BLOCK_PATTERN, "");
  for (const [, rawName = "", rawAttributes = ""] of markup.matchAll(TAG_PATTERN)) {
    const tag = rawName.toLowerCase();
    for (const attribute of rawAttributes.matchAll(ATTRIBUTE_PATTERN)) {
      const name = (attribute[1] ?? "").toLowerCase();
      const value = decodeHtmlEntities(attribute[2] ?? attribute[3] ?? attribute[4] ?? "");
      if (name === "src" && tag === "img" && isRemoteUrl(value)) return true;
      if (name === "background" && BACKGROUND_ATTRIBUTE_TAGS.has(tag) && isRemoteUrl(value)) {
        return true;
      }
      if (name === "style" && cssHasRemoteUrl(value)) return true;
    }
  }
  return false;
}

/** True when the rendered message would fetch http(s) content once the user allows remote content. */
export function emailHtmlHasRemoteContent(
  options: Omit<ProcessEmailHtmlOptions, "blockRemoteImages">,
): boolean {
  if (!options.html.trim()) return false;
  return sanitizedHtmlHasRemoteContent(
    processEmailHtml({ ...options, blockRemoteImages: false }),
  );
}

function isTrackingPixelTag(tag: string): boolean {
  const width = parseCssSize(getAttribute(tag, "width")) ?? parseStyleSize(tag, "width");
  const height = parseCssSize(getAttribute(tag, "height")) ?? parseStyleSize(tag, "height");

  if (width == null && height == null) return false;
  return (width != null && width > 0 && width <= 2) || (height != null && height > 0 && height <= 2);
}

function getAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function parseStyleSize(tag: string, prop: string): number | null {
  const style = getAttribute(tag, "style");
  if (!style) return null;

  const match = style.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([0-9.]+)\\s*(?:px)?`, "i"));
  return parseCssSize(match?.[1] ?? null);
}

function parseCssSize(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}
