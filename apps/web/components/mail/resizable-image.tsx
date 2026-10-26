"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ResizableImageView } from "./resizable-image-view";

export const ResizableImage = Node.create({
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

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});
