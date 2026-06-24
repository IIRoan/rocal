"use client";

import { Node as TiptapNode, mergeAttributes } from "@tiptap/core";
import { DOMSerializer } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";

export const QUOTED_HTML_MARKER = "data-quoted-html";

/**
 * Atomic block node that carries verbatim quoted/forwarded email HTML.
 * See Bulwark webmail reference — layout-heavy emails survive 1:1 in the editor.
 */
export const QuotedHtml = TiptapNode.create({
  name: "quotedHtml",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  isolating: true,

  addAttributes() {
    return {
      html: {
        default: "",
        parseHTML: (el) => el.innerHTML,
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: `div[${QUOTED_HTML_MARKER}]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { [QUOTED_HTML_MARKER]: "" })];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement("div");
      dom.setAttribute(QUOTED_HTML_MARKER, "");
      dom.className = "quoted-html-island";
      dom.style.cssText =
        "border-left:2px solid color-mix(in oklch, var(--border) 80%, transparent);padding-left:12px;margin-top:8px;";

      const shadow = dom.attachShadow({ mode: "open" });

      // Style tag to preserve original email layout (tables, widths, fonts)
      const style = document.createElement("style");
      style.textContent = `
        :host {
          display: block;
          all: initial;
        }
        * {
          box-sizing: border-box;
        }
        table {
          border-collapse: collapse;
          table-layout: auto;
        }
        img {
          max-width: 100%;
          height: auto;
        }
        a {
          color: var(--primary, #b45309);
        }
        body, div {
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
          line-height: 1.5;
        }
        @media (prefers-color-scheme: dark) {
          :host {
            color-scheme: dark;
          }
        }
      `;
      shadow.appendChild(style);

      const inner = document.createElement("div");
      inner.contentEditable = "true";
      inner.style.cssText = "outline:none;";
      inner.innerHTML = node.attrs.html || "";
      shadow.appendChild(inner);

      let focused = false;
      const onFocusIn = () => {
        focused = true;
      };
      const onFocusOut = () => {
        focused = false;
      };
      inner.addEventListener("focusin", onFocusIn);
      inner.addEventListener("focusout", onFocusOut);

      let frame = 0;
      const syncBack = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          if (typeof getPos !== "function") return;
          const pos = getPos();
          if (pos == null) return;
          const current = inner.innerHTML;
          if (current === node.attrs.html) return;
          editor.view.dispatch(
            editor.view.state.tr
              .setNodeAttribute(pos, "html", current)
              .setMeta("addToHistory", false),
          );
        });
      };
      inner.addEventListener("input", syncBack);

      return {
        dom,
        ignoreMutation: () => true,
        stopEvent: (event) => {
          const target = event.target as Node | null;
          return !!target && dom.contains(target);
        },
        update: (updatedNode) => {
          if (updatedNode.type.name !== "quotedHtml") return false;
          if (!focused && inner.innerHTML !== updatedNode.attrs.html) {
            inner.innerHTML = updatedNode.attrs.html || "";
          }
          return true;
        },
        destroy: () => {
          cancelAnimationFrame(frame);
          inner.removeEventListener("focusin", onFocusIn);
          inner.removeEventListener("focusout", onFocusOut);
          inner.removeEventListener("input", syncBack);
        },
      };
    };
  },
});

export function serializeEditorContent(editor: Editor): string {
  const serializer = DOMSerializer.fromSchema(editor.schema);
  const parts: string[] = [];
  editor.state.doc.forEach((node) => {
    if (node.type.name === "quotedHtml") {
      parts.push(buildQuotedHtmlBlock((node.attrs.html as string) || ""));
      return;
    }
    const fragment = serializer.serializeNode(node);
    const tmp = document.createElement("div");
    tmp.appendChild(fragment);
    parts.push(tmp.innerHTML);
  });
  return parts.join("");
}

export function buildQuotedHtmlBlock(sanitizedInnerHtml: string): string {
  return `<div ${QUOTED_HTML_MARKER}>${sanitizedInnerHtml}</div>`;
}
