import { Node, mergeAttributes } from "@tiptap/core";

/** Inline image whose content id survives in `data-cid`, so a send can turn embedded images into `cid:` parts. */
export const MailImage = Node.create({
  name: "image",
  group: "inline",
  inline: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: { default: null },
      cid: {
        default: null,
        parseHTML: (el) => {
          const dataCid = el.getAttribute("data-cid");
          if (dataCid) return dataCid;
          const src = el.getAttribute("src") || "";
          if (/^cid:/i.test(src)) return src.slice(4) || null;
          return null;
        },
        renderHTML: (attrs) => (attrs.cid ? { "data-cid": attrs.cid } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs: Record<string, string> = { ...HTMLAttributes };
    if (attrs.width) {
      attrs.style = `width: ${attrs.width}px; max-width: 100%;`;
      delete attrs.width;
    }
    return ["img", mergeAttributes(attrs)];
  },
});
