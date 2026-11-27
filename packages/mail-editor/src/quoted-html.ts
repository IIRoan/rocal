import { Node as TiptapNode, mergeAttributes, type Editor } from "@tiptap/core";
import { DOMSerializer, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  buildQuotedHtmlBlock,
  QUOTED_HTML_MARKER,
} from "@workspace/calendar-core/mail-compose-html";
import { isReplyQuoteHeader } from "@workspace/calendar-core/mail-quote";
import { sanitizeUntrustedEmailHtml } from "@workspace/calendar-core/sanitize-email-html";

export type QuotedHtmlOptions = {
  /** Class of a reply quote's header line, which folds and unfolds it. */
  toggleClass: string;
  /** Class of the button that drops a reply's quote from the message. */
  removeClass: string;
};

const SVG_NS = "http://www.w3.org/2000/svg";

type FrameTypography = {
  color: string;
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  linkColor: string;
  borderColor: string;
  colorScheme: string;
};

/** Computed styles go into the frame's stylesheet, so nothing that could close the style element survives. */
function cssValue(value: string, fallback: string): string {
  const cleaned = value.replace(/[<>{};]/g, "").trim();
  return cleaned || fallback;
}

function readTypography(editorDom: HTMLElement): FrameTypography {
  const view = editorDom.ownerDocument.defaultView;
  const style = view?.getComputedStyle(editorDom);
  const rootStyle = view?.getComputedStyle(editorDom.ownerDocument.documentElement);
  return {
    color: cssValue(style?.color ?? "", "inherit"),
    fontFamily: cssValue(style?.fontFamily ?? "", "system-ui, sans-serif"),
    fontSize: cssValue(style?.fontSize ?? "", "14px"),
    lineHeight: cssValue(style?.lineHeight ?? "", "1.6"),
    linkColor: cssValue(rootStyle?.getPropertyValue("--accent") ?? "", "currentColor"),
    borderColor: cssValue(rootStyle?.getPropertyValue("--border") ?? "", "rgba(128,128,128,.4)"),
    colorScheme: cssValue(rootStyle?.colorScheme ?? "", "light dark"),
  };
}

/** The quote frame's document: no scripts, no remote loads, and the editor's own type so it reads as part of the message. */
function buildQuoteFrameDocument(html: string, type: FrameTypography): string {
  const csp = "default-src 'none'; img-src data:; style-src 'unsafe-inline'";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><meta name="color-scheme" content="${type.colorScheme}"><style>html,body{margin:0;padding:0;background:transparent}body{color:${type.color};font-family:${type.fontFamily};font-size:${type.fontSize};line-height:${type.lineHeight};overflow:hidden;overflow-wrap:break-word;outline:none}*{box-sizing:border-box}img{max-width:100%;height:auto}table{border-collapse:collapse;table-layout:auto;max-width:100%}a{color:${type.linkColor}}blockquote{margin:0 0 0 4px;padding-left:12px;border-left:2px solid ${type.borderColor}}p{margin:0 0 .75em}p:last-child{margin-bottom:0}</style></head><body>${sanitizeUntrustedEmailHtml(html)}</body></html>`;
}

/** Atomic block carrying a quoted or forwarded message's own HTML verbatim, shown in a sandboxed frame so its layout survives and none of it runs in the app. */
export const QuotedHtml = TiptapNode.create<QuotedHtmlOptions>({
  name: "quotedHtml",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  isolating: true,

  addOptions() {
    return { toggleClass: "", removeClass: "" };
  },

  addProseMirrorPlugins() {
    // A reply's header line is shown on the quote's own toggle, so its paragraph stays in the message but out of view.
    return [new Plugin({ props: { decorations: (state) => hideReplyHeaders(state.doc) } })];
  },

  addAttributes() {
    return {
      html: {
        default: "",
        // Quotes, drafts and pastes all enter here, so the markup is hostile until sanitized.
        parseHTML: (el) => sanitizeUntrustedEmailHtml(el.innerHTML),
        renderHTML: () => ({}),
      },
      kind: {
        default: "reply",
        parseHTML: (el) => (el.getAttribute(QUOTED_HTML_MARKER) === "forward" ? "forward" : "reply"),
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: `div[${QUOTED_HTML_MARKER}]` }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { [QUOTED_HTML_MARKER]: node.attrs.kind === "forward" ? "forward" : "" })];
  },

  addNodeView() {
    const options = this.options;
    return ({ node, editor, getPos }) => {
      const dom = document.createElement("div");
      const island = document.createElement("div");
      island.setAttribute(QUOTED_HTML_MARKER, "");
      island.className = "quoted-html-island";
      island.style.cssText =
        "border-left:2px solid color-mix(in oklch, var(--border, currentColor) 80%, transparent);padding-left:12px;margin-top:8px;";
      const frame = document.createElement("iframe");
      // Same-origin lets the editor size the frame and edit the quote in place; without allow-scripts nothing in the quote can run.
      frame.setAttribute("sandbox", "allow-same-origin");
      frame.setAttribute("referrerpolicy", "no-referrer");
      frame.setAttribute("title", "Quoted message");
      frame.style.cssText = "display:block;width:100%;height:0;border:0;background:transparent;";
      island.appendChild(frame);
      dom.appendChild(island);

      let html = (node.attrs.html as string) || "";
      let focused = false;
      let pendingSync = 0;
      let observer: ResizeObserver | null = null;

      const resize = () => {
        const body = frame.contentDocument?.body;
        if (!body) return;
        frame.style.height = `${Math.ceil(body.scrollHeight)}px`;
      };
      const syncBack = () => {
        cancelAnimationFrame(pendingSync);
        pendingSync = requestAnimationFrame(() => {
          resize();
          if (typeof getPos !== "function") return;
          const pos = getPos();
          const body = frame.contentDocument?.body;
          if (pos == null || !body) return;
          const next = sanitizeUntrustedEmailHtml(body.innerHTML);
          if (next === html) return;
          html = next;
          editor.view.dispatch(
            editor.view.state.tr.setNodeAttribute(pos, "html", next).setMeta("addToHistory", false),
          );
        });
      };
      const onFocus = () => {
        focused = true;
      };
      const onBlur = () => {
        focused = false;
      };
      // Links in a quote are text being edited, never navigation out of the compose window.
      const onClick = (event: Event) => {
        const target = event.target as Element | null;
        if (target?.closest?.("a")) event.preventDefault();
      };
      const onLoad = () => {
        const doc = frame.contentDocument;
        if (!doc) return;
        doc.designMode = editor.isEditable ? "on" : "off";
        doc.addEventListener("input", syncBack);
        doc.addEventListener("click", onClick);
        doc.addEventListener("focusin", onFocus);
        doc.addEventListener("focusout", onBlur);
        observer?.disconnect();
        if (typeof ResizeObserver !== "undefined") {
          observer = new ResizeObserver(resize);
          observer.observe(doc.body);
        }
        resize();
      };
      const render = () => {
        frame.srcdoc = buildQuoteFrameDocument(html, readTypography(editor.view.dom));
      };
      frame.addEventListener("load", onLoad);
      // Node views are built before the editor view mounts, and the frame takes its type from the mounted editor.
      let pendingRender = requestAnimationFrame(render);

      const detachBar = replyQuoteBar({ dom, island, getPos, editor, options, onOpen: resize });

      return {
        dom,
        ignoreMutation: () => true,
        stopEvent: (event) => {
          const target = event.target as globalThis.Node | null;
          return !!target && dom.contains(target);
        },
        update: (updatedNode) => {
          if (updatedNode.type.name !== "quotedHtml") return false;
          const next = (updatedNode.attrs.html as string) || "";
          if (!focused && next !== html) {
            html = next;
            cancelAnimationFrame(pendingRender);
            pendingRender = requestAnimationFrame(render);
          }
          return true;
        },
        destroy: () => {
          cancelAnimationFrame(pendingSync);
          cancelAnimationFrame(pendingRender);
          observer?.disconnect();
          frame.removeEventListener("load", onLoad);
          const doc = frame.contentDocument;
          doc?.removeEventListener("input", syncBack);
          doc?.removeEventListener("click", onClick);
          doc?.removeEventListener("focusin", onFocus);
          doc?.removeEventListener("focusout", onBlur);
          detachBar?.();
        },
      };
    };
  },
});

/** The "On …, … wrote:" paragraph right before a quote, when there is one. */
function replyHeaderBefore(doc: ProseMirrorNode, pos: number): ProseMirrorNode | null {
  const header = doc.resolve(pos).nodeBefore;
  return header && isReplyQuoteHeader(header.textContent) ? header : null;
}

function hideReplyHeaders(doc: ProseMirrorNode): DecorationSet {
  const hidden: Decoration[] = [];
  doc.forEach((node, offset) => {
    const header = node.type.name === "quotedHtml" ? replyHeaderBefore(doc, offset) : null;
    if (header) hidden.push(Decoration.node(offset - header.nodeSize, offset, { style: "display:none" }));
  });
  return DecorationSet.create(doc, hidden);
}

function chevronIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  const attributes = { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" };
  for (const [name, value] of Object.entries(attributes)) svg.setAttribute(name, value);
  const line = document.createElementNS(SVG_NS, "polyline");
  line.setAttribute("points", "6 9 12 15 18 9");
  svg.appendChild(line);
  return svg;
}

/** A reply's quote starts folded under its header line, which opens and closes it, beside Remove; forwards stay open. */
function replyQuoteBar(input: {
  dom: HTMLElement;
  island: HTMLElement;
  getPos: () => number | undefined;
  editor: Editor;
  options: QuotedHtmlOptions;
  onOpen: () => void;
}) {
  const { dom, island, getPos, editor, options, onOpen } = input;
  const pos = getPos();
  const header = typeof pos === "number" ? replyHeaderBefore(editor.state.doc, pos) : null;
  if (!header) return null;

  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;align-items:center;gap:8px;";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = options.toggleClass;
  const chevron = chevronIcon();
  const label = document.createElement("span");
  // The sender's name comes from the mail, so it only ever goes in as text.
  label.textContent = header.textContent.trim().replace(/:$/, "");
  toggle.append(chevron, label);
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = options.removeClass;
  remove.textContent = "Remove";
  remove.setAttribute("aria-label", "Remove quoted message");
  bar.append(toggle, remove);

  const setOpen = (open: boolean) => {
    island.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    chevron.style.transform = open ? "rotate(180deg)" : "";
    if (open) onOpen();
  };
  const onToggle = () => setOpen(island.hidden);
  const onRemove = () => {
    const at = getPos();
    const quote = typeof at === "number" ? editor.state.doc.nodeAt(at) : null;
    if (!editor.isEditable || typeof at !== "number" || !quote) return;
    const before = replyHeaderBefore(editor.state.doc, at);
    editor.chain().deleteRange({ from: before ? at - before.nodeSize : at, to: at + quote.nodeSize }).focus().run();
  };
  toggle.addEventListener("click", onToggle);
  remove.addEventListener("click", onRemove);
  setOpen(false);
  dom.insertBefore(bar, island);
  return () => {
    toggle.removeEventListener("click", onToggle);
    remove.removeEventListener("click", onRemove);
  };
}

/** The editor's HTML with each quote written back as its marked block, which `getHTML` would drop. */
export function serializeEditorContent(editor: Editor): string {
  const serializer = DOMSerializer.fromSchema(editor.schema);
  const parts: string[] = [];
  editor.state.doc.forEach((node) => {
    if (node.type.name === "quotedHtml") {
      parts.push(buildQuotedHtmlBlock((node.attrs.html as string) || "", node.attrs.kind === "forward" ? "forward" : "reply"));
      return;
    }
    const fragment = serializer.serializeNode(node);
    const tmp = document.createElement("div");
    tmp.appendChild(fragment);
    parts.push(tmp.innerHTML);
  });
  return parts.join("");
}
