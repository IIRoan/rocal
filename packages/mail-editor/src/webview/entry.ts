import { Editor } from "@tiptap/core";
import {
  dropInlineImagePlaceholders,
  INLINE_IMAGE_PLACEHOLDER,
  replaceInlineImagePlaceholders,
} from "@workspace/calendar-core/mail-compose-html";
import { createMailEditorExtensions } from "../extensions";
import { serializeEditorContent } from "../quoted-html";
import { applyComposeSignatureHtml } from "../signature-html";
import { setMailEditorLink } from "../editor-actions";
import {
  MAIL_EDITOR_COMMAND_FUNCTION,
  type MailEditorCommand,
  type MailEditorEvent,
  type MailEditorFormatState,
} from "../commands";

type EditorPageConfig = { html: string; placeholder: string };

type EditorPageWindow = Window & {
  ReactNativeWebView?: { postMessage: (message: string) => void };
  __solaceMailEditorConfig?: EditorPageConfig;
  [MAIL_EDITOR_COMMAND_FUNCTION]?: (command: MailEditorCommand) => void;
};

// Read on use, not at import, so the module stays safe to load where `window` is absent.
const page = () => window as EditorPageWindow;
const CHANGE_DEBOUNCE_MS = 150;
const IMAGE_UPDATE = "solaceImageUpdate";

function post(event: MailEditorEvent) {
  page().ReactNativeWebView?.postMessage(JSON.stringify(event));
}

function start(config: EditorPageConfig) {
  const element = document.getElementById("editor");
  if (!element) return;
  let typed = false;
  let changeTimer: ReturnType<typeof setTimeout> | null = null;
  let lastState = "";

  const editor = new Editor({
    element,
    extensions: createMailEditorExtensions({ placeholder: config.placeholder, quoteToggleClass: "quote-toggle", quoteRemoveClass: "quote-remove" }),
    content: config.html,
    editorProps: {
      attributes: { role: "textbox", "aria-multiline": "true", "aria-label": "Message body" },
      handleDOMEvents: {
        // A tap below the text of an untouched body starts writing at the top, above the seeded signature and quote.
        mousedown: (view, event) => {
          if (typed || event.target !== view.dom) return false;
          event.preventDefault();
          editor.commands.focus("start");
          return true;
        },
      },
    },
    onUpdate: ({ transaction }) => {
      if (transaction.getMeta(IMAGE_UPDATE)) return;
      typed = true;
      scheduleChange();
    },
    onTransaction: () => postState(),
    onFocus: () => post({ type: "focus" }),
    onBlur: () => {
      flushChange();
      post({ type: "blur" });
    },
  });

  function postChange() {
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = null;
    post({ type: "change", html: serializeEditorContent(editor) });
  }

  function flushChange() {
    if (changeTimer) postChange();
  }

  // Serializing a body with embedded images is heavy, so a burst of keystrokes posts once.
  function scheduleChange() {
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = setTimeout(postChange, CHANGE_DEBOUNCE_MS);
  }

  function postState() {
    const state: MailEditorFormatState = {
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      underline: editor.isActive("underline"),
      strike: editor.isActive("strike"),
      bulletList: editor.isActive("bulletList"),
      orderedList: editor.isActive("orderedList"),
      blockquote: editor.isActive("blockquote"),
      link: (editor.getAttributes("link").href as string | undefined) ?? null,
      hasSelection: !editor.state.selection.empty,
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
    };
    const serialized = JSON.stringify(state);
    if (serialized === lastState) return;
    lastState = serialized;
    post({ type: "state", state });
  }

  function format(command: Extract<MailEditorCommand, { type: "format" }>["format"]) {
    const chain = editor.chain().focus();
    switch (command) {
      case "bold":
        return chain.toggleBold().run();
      case "italic":
        return chain.toggleItalic().run();
      case "underline":
        return chain.toggleUnderline().run();
      case "strike":
        return chain.toggleStrike().run();
      case "bulletList":
        return chain.toggleBulletList().run();
      case "orderedList":
        return chain.toggleOrderedList().run();
      case "blockquote":
        return chain.toggleBlockquote().run();
      case "clearFormatting":
        return chain.clearNodes().unsetAllMarks().run();
      case "undo":
        return chain.undo().run();
      case "redo":
        return chain.redo().run();
    }
  }

  // What the page holds right after the app set it, so the app can tell real edits from the editor's normalising.
  function postBaseline() {
    post({ type: "baseline", html: serializeEditorContent(editor) });
  }

  // Loaded quoted images go in place without replacing the document, so the caret, typing and undo history stay; the app applies the same change itself.
  function updateImages(sources: ReadonlyMap<string, string>, drop: ReadonlySet<string>) {
    const { tr } = editor.state;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "quotedHtml") {
        const html = (node.attrs.html as string) || "";
        const next = dropInlineImagePlaceholders(replaceInlineImagePlaceholders(html, sources), drop);
        if (next !== html) tr.setNodeAttribute(tr.mapping.map(pos), "html", next);
        return false;
      }
      const cid = node.type.name === "image" && node.attrs.src === INLINE_IMAGE_PLACEHOLDER ? (node.attrs.cid as string | null) : null;
      if (!cid) return true;
      const src = sources.get(cid);
      if (src) tr.setNodeAttribute(tr.mapping.map(pos), "src", src);
      else if (drop.has(cid)) tr.delete(tr.mapping.map(pos), tr.mapping.map(pos + node.nodeSize));
      return false;
    });
    if (tr.docChanged) editor.view.dispatch(tr.setMeta("addToHistory", false).setMeta(IMAGE_UPDATE, true));
  }

  page()[MAIL_EDITOR_COMMAND_FUNCTION] = (command) => {
    switch (command.type) {
      case "setContent":
        editor.commands.setContent(command.html, { emitUpdate: false });
        postBaseline();
        return;
      case "focus":
        editor.commands.focus(command.position);
        return;
      case "format":
        format(command.format);
        return;
      case "setLink":
        setMailEditorLink(editor, command.href);
        return;
      case "insertHtml": {
        const chain = editor.chain().focus();
        if (command.afterSelection) chain.setTextSelection(editor.state.selection.to);
        chain.insertContent(command.html).run();
        return;
      }
      case "insertImage":
        editor.chain().focus().insertContent({ type: "image", attrs: { src: command.src, alt: command.alt } }).run();
        return;
      case "applySignature": {
        const html = serializeEditorContent(editor);
        const next = applyComposeSignatureHtml(html, command);
        if (next === html) return;
        editor.commands.setContent(next, { emitUpdate: false });
        postChange();
        return;
      }
      case "setEditable":
        editor.setEditable(command.editable);
        return;
      case "updateImages":
        updateImages(new Map(Object.entries(command.sources)), new Set(command.drop));
        return;
      case "flush":
        if (changeTimer) clearTimeout(changeTimer);
        changeTimer = null;
        post({ type: "flushed", id: command.id, html: serializeEditorContent(editor) });
        return;
    }
  };

  postState();
  postBaseline();
  post({ type: "ready" });
}

const config = page().__solaceMailEditorConfig;
if (config) start(config);
