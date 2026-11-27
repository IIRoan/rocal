import type { Editor } from "@tiptap/react";
import type { InlineImageUpload } from "@/components/mail/rich-text-editor";
import { getComposeInlineImages } from "./compose-inline-images";
import { extractComposeInlineImages } from "@workspace/calendar-core";

export type QuotedInlineAttachment = {
  blobId?: string | null;
  name?: string | null;
  type?: string | null;
  size?: number | null;
  disposition?: string | null;
  cid?: string | null;
};

type ComposeInlineAttachment = {
  blobId: string | null;
  name: string;
  type: string;
  size: number;
  disposition: "inline";
  cid: string;
  content: Uint8Array;
};

/** Points compose images at `cid:` parts: known ones keep their blob, any other embedded image (a reopened draft's) is decoded from its data URL. */
export function rewriteComposeInlineImages(html: string): {
  html: string;
  attachments: ComposeInlineAttachment[];
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

  const embedded = extractComposeInlineImages(doc.body.innerHTML, () => `${crypto.randomUUID()}@solace`);
  return {
    html: embedded.html,
    attachments: [
      ...Array.from(used.values()).map((entry) => ({
        blobId: entry.blobId,
        name: entry.name,
        type: entry.type,
        size: entry.size,
        disposition: "inline" as const,
        cid: entry.cid,
        content: entry.content,
      })),
      ...embedded.images.map((image) => ({
        blobId: null,
        name: image.filename,
        type: image.contentType,
        size: image.content.byteLength,
        disposition: "inline" as const,
        cid: image.cid,
        content: image.content,
      })),
    ],
  };
}

/** Uploads each image and inserts it once uploaded, at `position()` when that gives one, else at the cursor. */
export function insertUploadedImages(
  editor: Editor,
  files: File[],
  upload: (file: File) => Promise<InlineImageUpload | null>,
  position?: () => number | undefined,
) {
  for (const file of files) {
    // upload (handleComposeImageUpload) reports failures itself and returns null.
    void upload(file)
      .then((result) => {
        if (!result) return;
        const at = position?.();
        requestAnimationFrame(() => {
          if (editor.isDestroyed) return;
          const image = { type: "image", attrs: { src: result.src, alt: file.name, cid: result.cid } };
          const chain = editor.chain().focus();
          if (typeof at === "number") chain.insertContentAt(at, image).run();
          else chain.insertContent(image).run();
        });
      })
      .catch(() => undefined);
  }
}
