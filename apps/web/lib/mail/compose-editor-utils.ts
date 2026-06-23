import { getComposeInlineImages } from "./compose-inline-images";

export type QuotedInlineAttachment = {
  blobId?: string | null;
  name?: string | null;
  type?: string | null;
  size?: number | null;
  disposition?: string | null;
  cid?: string | null;
};

const HTML_ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
} as const;

export const INLINE_IMAGE_PLACEHOLDER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) =>
    HTML_ESCAPE_MAP[char as keyof typeof HTML_ESCAPE_MAP],
  );
}

export function plainTextToComposerBody(text: string): string {
  if (!text) return "";

  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Strip unsafe tags from quoted email HTML before embedding in QuotedHtml. */
export function sanitizeQuotedEmailHtml(html: string): string {
  if (typeof document === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  doc
    .querySelectorAll("script, style, iframe, object, embed, link[rel='stylesheet']")
    .forEach((el) => el.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name)) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return doc.body.innerHTML;
}

export function rewriteCidImagesForEditor(html: string): string {
  if (!html || html.indexOf("cid:") === -1) return html;
  if (typeof document === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  let touched = false;
  doc.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") || "";
    if (!/^cid:/i.test(src)) return;
    const cid = src.slice(4);
    if (!cid) return;
    if (!img.getAttribute("data-cid")) {
      img.setAttribute("data-cid", cid);
    }
    img.setAttribute("src", INLINE_IMAGE_PLACEHOLDER);
    touched = true;
  });
  return touched ? doc.body.innerHTML : html;
}

export function rewriteComposeInlineImages(html: string): {
  html: string;
  attachments: Array<{
    blobId: string;
    name: string;
    type: string;
    size: number;
    disposition: "inline";
    cid: string;
  }>;
} {
  const known = getComposeInlineImages();
  if (typeof document === "undefined") {
    return { html, attachments: [] };
  }

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const used = new Map<string, (typeof known)[number]>();

  if (known.length > 0) {
    doc.querySelectorAll("img[data-cid]").forEach((img) => {
      const cid = img.getAttribute("data-cid");
      if (!cid) return;
      const entry = known.find((e) => e.cid === cid);
      if (!entry) return;
      img.setAttribute("src", `cid:${cid}`);
      img.removeAttribute("data-cid");
      used.set(cid, entry);
    });
  }

  doc.querySelectorAll("td > p, th > p").forEach((p) => {
    const existing = p.getAttribute("style") || "";
    p.setAttribute("style", `margin:0;${existing}`);
  });

  return {
    html: doc.body.innerHTML,
    attachments: Array.from(used.values()).map((entry) => ({
      blobId: entry.blobId,
      name: entry.name,
      type: entry.type,
      size: entry.size,
      disposition: "inline" as const,
      cid: entry.cid,
    })),
  };
}

export function htmlHasUnhydratedInlinePlaceholders(html: string): boolean {
  return (
    html.includes("data-cid") && html.includes(INLINE_IMAGE_PLACEHOLDER)
  );
}

export function replaceInlineImagePlaceholders(
  html: string,
  cidToDataUrl: Map<string, string>,
): string {
  if (!html || cidToDataUrl.size === 0) return html;
  if (html.indexOf("data-cid") === -1) return html;
  if (typeof document === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  let changed = false;
  doc.querySelectorAll("img[data-cid]").forEach((img) => {
    const cid = img.getAttribute("data-cid");
    if (!cid) return;
    const dataUrl = cidToDataUrl.get(cid);
    if (!dataUrl) return;
    const currentSrc = img.getAttribute("src") || "";
    if (
      currentSrc !== INLINE_IMAGE_PLACEHOLDER &&
      !/^cid:/i.test(currentSrc)
    ) {
      return;
    }
    img.setAttribute("src", dataUrl);
    changed = true;
  });
  return changed ? doc.body.innerHTML : html;
}
