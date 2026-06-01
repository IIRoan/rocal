export interface ProcessEmailHtmlOptions {
  html: string;
  isDark: boolean;
  blockTrackingPixels: boolean;
  blockRemoteImages?: boolean;
}

export interface BuildEmailHtmlDocumentOptions {
  processedHtml: string;
  isDark: boolean;
  blockRemoteImages: boolean;
  hasOwnDark: boolean;
  mobileViewport?: boolean;
}

export const EMAIL_AUTO_DARK_CSS = `
  @media (prefers-color-scheme: dark) {
    html, body {
      background-color: #1a1a1a !important;
      color: #e0e0e0 !important;
    }
    div, td, th, tr, table, p, span, li, h1, h2, h3, h4, h5, h6, blockquote, section, article, header, footer {
      background-color: inherit;
      color: inherit;
    }
    [style*="background-color: #fff"],
    [style*="background-color: #ffffff"],
    [style*="background-color: white"],
    [style*="background:#fff"],
    [style*="background:#ffffff"],
    [style*="background: #fff"],
    [style*="background: #ffffff"],
    [style*="background-color:#fff"],
    [style*="background-color:#ffffff"] {
      background-color: #1a1a1a !important;
    }
    [style*="background-color: #f"],
    [style*="background-color:#f"] {
      filter: brightness(0.25) contrast(1.1);
    }
    [style*="color: #000"],[style*="color:#000"],
    [style*="color: #111"],[style*="color:#111"],
    [style*="color: #1a1a1a"],
    [style*="color: #202124"],[style*="color:#202124"],
    [style*="color: #2d0c0c"],[style*="color:#2d0c0c"],
    [style*="color: #3c4043"],[style*="color:#3c4043"],
    [style*="color: #3c4042"],[style*="color:#3c4042"],
    [style*="color: black"],[style*="color:black"] {
      color: #e0e0e0 !important;
    }
    [style*="color: #5f6368"],[style*="color:#5f6368"],
    [style*="color: #70757a"],[style*="color:#70757a"],
    [style*="color: #666"],[style*="color:#666"] {
      color: #9aa0a6 !important;
    }
    [style*="background-color: #fce8e6"],[style*="background-color:#fce8e6"] {
      background-color: #442c2c !important; color: #f8b4b4 !important;
    }
    [style*="background-color: #e8f0fe"],[style*="background-color:#e8f0fe"] {
      background-color: #1e2a3a !important; color: #8ab4f8 !important;
    }
    [style*="background-color: #e6f4ea"],[style*="background-color:#e6f4ea"] {
      background-color: #1e3a2a !important; color: #81c995 !important;
    }
    [style*="background-color: #fef7e0"],[style*="background-color:#fef7e0"] {
      background-color: #3a341e !important; color: #fdd663 !important;
    }
    [style*="border"] { border-color: #3a3a3a !important; }
    img { filter: brightness(0.95) contrast(1.05); }
    a { color: #8ab4f8 !important; }
    a[style*="color: #1a73e8"],a[style*="color:#1a73e8"],
    a[style*="color: #185abc"],a[style*="color:#185abc"] {
      color: #8ab4f8 !important;
    }
  }
`;

export function emailHasOwnDarkMode(html: string): boolean {
  return /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/i.test(html);
}

export function processEmailHtml({
  html,
  isDark,
  blockTrackingPixels,
  blockRemoteImages = false,
}: ProcessEmailHtmlOptions): string {
  let processed = extractBodyHtml(html);

  if (blockTrackingPixels || blockRemoteImages) {
    processed = processed.replace(/<img\b[^>]*>/gi, (tag) => {
      if (blockRemoteImages && isRemoteImageTag(tag)) return "";
      if (blockTrackingPixels && isTrackingPixelTag(tag)) return "";
      return tag;
    });
  }

  if (!isDark) {
    processed = processed.replace(
      /<meta[^>]*name=["'](?:color-scheme|supported-color-schemes)["'][^>]*\/?>/gi,
      "",
    );
    processed = processed.replace(
      /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{(?:[^{}]|\{[^{}]*\})*\}/gi,
      "",
    );
  }

  return processed;
}

export function buildEmailHtmlDocument({
  processedHtml,
  isDark,
  blockRemoteImages,
  hasOwnDark,
  mobileViewport,
}: BuildEmailHtmlDocumentOptions): string {
  const csp = blockRemoteImages
    ? `<meta http-equiv="Content-Security-Policy" content="img-src 'none'; connect-src 'none';">`
    : "";
  const scheme = isDark ? "dark" : "light";
  const bg = isDark ? "#1a1a1a" : "#fff";
  const fg = isDark ? "#e0e0e0" : "#111";
  const linkColor = isDark ? "#8ab4f8" : "#2563eb";
  const autoDarkStyles = isDark && !hasOwnDark ? `<style>${EMAIL_AUTO_DARK_CSS}</style>` : "";
  const viewport = mobileViewport
    ? `<meta name="viewport" content="width=device-width, initial-scale=1">`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8">${viewport}<meta name="color-scheme" content="${scheme}">${csp}<base target="_blank"><style>*{box-sizing:border-box}html,body{margin:0;padding:0;color-scheme:${scheme}}body{background:${bg};font-family:system-ui,-apple-system,"Helvetica Neue",sans-serif;font-size:14px;line-height:1.6;padding:16px 20px;color:${fg};word-break:break-word;overflow-wrap:anywhere;overflow-x:hidden}img{max-width:100%;height:auto}a{color:${linkColor}}p{margin:0 0 1em}p:last-child{margin:0}</style>${autoDarkStyles}</head><body>${processedHtml}</body></html>`;
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
  const src = getAttribute(tag, "src")?.trim() ?? "";
  return /^(?:https?:)?\/\//i.test(src);
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
