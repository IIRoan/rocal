import { describe, expect, it } from "@jest/globals";
import { Editor } from "@tiptap/core";
import { buildForwardQuoteHtml, buildReplyQuoteHtml } from "@workspace/calendar-core/mail-compose-html";
import { createMailEditorExtensions } from "./extensions";
import { serializeEditorContent } from "./quoted-html";
import { applyComposeSignatureHtml } from "./signature-html";
import { setMailEditorLink } from "./editor-actions";
import { mailEditorCommandScript, parseMailEditorEvent } from "./protocol";

async function withEditor(content: string, run: (editor: Editor) => void) {
  const editor = new Editor({ extensions: createMailEditorExtensions({ quoteToggleClass: "fold", quoteRemoveClass: "remove" }), content });
  try {
    // The quote frame renders on the next frame, once the editor has mounted.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    run(editor);
  } finally {
    editor.destroy();
  }
}

const HOSTILE_QUOTE = '<div data-quoted-html><p>Quoted line</p><img src="x" onerror="window.alert(1)"><script>alert(2)</script></div>';

describe("quoted mail", () => {
  it("renders the quote in a script-less sandboxed frame and keeps hostile markup out of it and the outgoing body", async () => {
    await withEditor(`<p>Reply</p>${HOSTILE_QUOTE}`, (editor) => {
      const frame = editor.view.dom.querySelector<HTMLIFrameElement>(".quoted-html-island iframe");
      expect(frame?.getAttribute("sandbox")).toBe("allow-same-origin");
      const srcdoc = frame?.getAttribute("srcdoc") ?? "";
      expect(srcdoc).toContain("Quoted line");
      expect(srcdoc).toContain("default-src 'none'; img-src data:");
      expect(srcdoc).not.toContain("onerror");
      expect(srcdoc).not.toContain("alert(2)");
      expect(serializeEditorContent(editor)).toBe("<p>Reply</p><div data-quoted-html><p>Quoted line</p><img src=\"x\"></div>");
    });
  });

  it("strips handlers from pasted quoted mail", async () => {
    await withEditor("<p>Reply</p>", (editor) => {
      // jsdom has no ClipboardEvent; only handlePaste props would read it.
      editor.view.pasteHTML(HOSTILE_QUOTE, new Event("paste") as ClipboardEvent);
      expect(editor.view.dom.querySelector(".quoted-html-island iframe")).not.toBeNull();
      expect(serializeEditorContent(editor)).not.toContain("onerror");
    });
  });

  it("folds a reply's quote under its header line, opens and closes it again, and leaves a forward open with its mark", async () => {
    await withEditor(`<p>Thanks</p>${buildReplyQuoteHtml({ date: "Nov 16", sender: "Maestro", quoteHtml: "<p>Quoted line</p>" })}`, (editor) => {
      const island = editor.view.dom.querySelector<HTMLElement>(".quoted-html-island");
      const toggle = editor.view.dom.querySelector<HTMLButtonElement>("button.fold");
      const header = [...editor.view.dom.querySelectorAll<HTMLElement>("p")].find((p) => p.textContent?.startsWith("On Nov 16"));
      expect(island?.hidden).toBe(true);
      expect(header?.style.display).toBe("none");
      expect(toggle?.textContent).toBe("On Nov 16, Maestro wrote");
      expect(toggle?.getAttribute("aria-expanded")).toBe("false");

      toggle?.click();
      expect(island?.hidden).toBe(false);
      expect(toggle?.getAttribute("aria-expanded")).toBe("true");
      toggle?.click();
      expect(island?.hidden).toBe(true);
      expect(toggle?.getAttribute("aria-expanded")).toBe("false");
      // Folding is view-only: the sent HTML still carries the header and the quote.
      expect(serializeEditorContent(editor)).toMatch(/<p>On Nov 16, Maestro wrote:<\/p><div data-quoted-html><p>Quoted line<\/p><\/div>/);
    });

    const forward = buildForwardQuoteHtml({ from: "peer@solace.test", date: "Nov 16", subject: "Plans", quoteHtml: "<p>Forwarded line</p>" });
    await withEditor(forward, (editor) => {
      expect(editor.view.dom.querySelector<HTMLElement>(".quoted-html-island")?.hidden).toBe(false);
      expect(editor.view.dom.querySelector("button[aria-expanded]")).toBeNull();
      expect(serializeEditorContent(editor)).toContain('<div data-quoted-html="forward"><p>Forwarded line</p></div>');
    });
  });

  it("removes a reply's quote together with its header line", async () => {
    await withEditor(`<p>Thanks</p>${buildReplyQuoteHtml({ date: "Nov 16", sender: "Maestro", quoteHtml: "<p>Quoted line</p>" })}`, (editor) => {
      editor.view.dom.querySelector<HTMLButtonElement>('button[aria-label="Remove quoted message"]')?.click();
      expect(editor.view.dom.querySelector(".quoted-html-island")).toBeNull();
      expect(serializeEditorContent(editor)).toBe("<p>Thanks</p>");
    });
  });
});

describe("schema", () => {
  it("drops script links but keeps web, mail, phone and relative links", async () => {
    await withEditor(
      '<p><a href="java&#9;script:alert(1)">bad</a> <a href="https://solace.onl">web</a> <a href="mailto:a@solace.onl">mail</a> <a href="tel:+31">phone</a> <a href="/path">relative</a></p>',
      (editor) => {
        const html = serializeEditorContent(editor);
        expect(html).not.toMatch(/script:/i);
        expect(html).toContain('href="https://solace.onl"');
        expect(html).toContain('href="mailto:a@solace.onl"');
        expect(html).toContain('href="tel:+31"');
        expect(html).toContain('href="/path"');
        expect(html).not.toContain("target=");
      },
    );
  });

  it("keeps an embedded image's content id and size", async () => {
    await withEditor('<p><img src="data:image/png;base64,AA==" alt="a.png" data-cid="a@solace" style="width: 120px"></p>', (editor) => {
      expect(serializeEditorContent(editor)).toContain('data-cid="a@solace"');
    });
  });
});

describe("links", () => {
  it("links the selection, inserts a link at an empty caret and unlinks", async () => {
    await withEditor("<p>Read the docs</p>", (editor) => {
      editor.commands.setTextSelection({ from: 10, to: 14 });
      setMailEditorLink(editor, "https://solace.onl/docs");
      expect(serializeEditorContent(editor)).toContain('<a rel="noopener noreferrer nofollow" href="https://solace.onl/docs">docs</a>');
      setMailEditorLink(editor, null);
      expect(serializeEditorContent(editor)).toBe("<p>Read the docs</p>");
      editor.commands.setTextSelection(1);
      setMailEditorLink(editor, "mailto:a@solace.onl");
      expect(serializeEditorContent(editor)).toContain('href="mailto:a@solace.onl">mailto:a@solace.onl</a>Read');
    });
  });
});

describe("signatures", () => {
  const work = { textSignature: "Sam\nWork" };
  const home = { textSignature: "Sam\nHome" };

  it("swaps an unchanged signature and inserts one the body lacks", async () => {
    const body = '<p>Hi</p><p data-signature-block="start"></p><p>Sam<br>Work</p><p data-signature-block="end"></p>';
    const swapped = applyComposeSignatureHtml(body, { candidates: [work, home], next: home, separator: false, aboveQuote: false, insert: true });
    expect(swapped).toContain("Sam<br>Home");
    expect(swapped).not.toContain("Work");

    const inserted = applyComposeSignatureHtml("<p>Hi</p>", { candidates: [work], next: work, separator: true, aboveQuote: false, insert: true });
    expect(inserted).toBe('<p>Hi</p><p data-signature-block="separator">-- </p><p>Sam<br>Work</p><p data-signature-block="end"></p>');
    expect(applyComposeSignatureHtml("<p>Hi</p>", { candidates: [work], next: work, separator: false, aboveQuote: false, insert: false })).toBe("<p>Hi</p>");
  });
});

describe("protocol", () => {
  it("accepts only well-formed editor events", async () => {
    expect(parseMailEditorEvent('{"type":"change","html":"<p>x</p>"}')).toEqual({ type: "change", html: "<p>x</p>" });
    expect(parseMailEditorEvent('{"type":"change","html":1}')).toBeNull();
    expect(parseMailEditorEvent('{"type":"ready","extra":true}')).toBeNull();
    expect(parseMailEditorEvent("not json")).toBeNull();
  });

  it("injects commands as JSON data", async () => {
    expect(mailEditorCommandScript({ type: "setContent", html: '");alert(1);("' })).toBe(
      'window.__solaceMailEditor&&window.__solaceMailEditor({"type":"setContent","html":"\\");alert(1);(\\""});true;',
    );
  });
});
