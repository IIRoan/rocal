/** @jest-environment jsdom */

import { expect, it } from "@jest/globals";
import { Editor } from "@tiptap/core";
import { richTextEditorExtensions } from "../../components/mail/rich-text-editor-extensions";
import { serializeEditorContent } from "../../components/mail/quoted-html";

const HOSTILE_QUOTE = '<div data-quoted-html><p>Quoted line</p><img src="x" onerror="window.alert(1)"></div>';

it("splits formatted mail paragraphs and restores them through undo and redo", () => {
  const editor = new Editor({
    extensions: richTextEditorExtensions,
    content: "<p><strong>First line</strong></p>",
  });

  try {
    expect(
      editor
        .chain()
        .selectTextblockEnd()
        .splitBlock()
        .unsetBold()
        .insertContent("Second line")
        .run(),
    ).toBe(true);
    expect(serializeEditorContent(editor)).toBe(
      "<p><strong>First line</strong></p><p>Second line</p>",
    );
    expect(editor.commands.undo()).toBe(true);
    expect(serializeEditorContent(editor)).toBe(
      "<p><strong>First line</strong></p>",
    );
    expect(editor.commands.redo()).toBe(true);
    expect(serializeEditorContent(editor)).toBe(
      "<p><strong>First line</strong></p><p>Second line</p>",
    );
  } finally {
    editor.destroy();
  }
});

it("renders quoted mail in a script-less sandboxed frame, never in the page", async () => {
  const editor = new Editor({
    extensions: richTextEditorExtensions,
    content: `<p>Reply</p>${HOSTILE_QUOTE}`,
  });

  try {
    // The quote frame renders on the next frame, once the editor has mounted.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const island = editor.view.dom.querySelector(".quoted-html-island");
    const frame = island?.querySelector("iframe");
    expect(island?.shadowRoot ?? null).toBeNull();
    expect(island?.querySelector("p")).toBeNull();
    expect(frame?.getAttribute("sandbox")).toBe("allow-same-origin");
    expect(frame?.getAttribute("srcdoc")).toContain("Quoted line");
    expect(frame?.getAttribute("srcdoc")).not.toContain("onerror");
    expect(serializeEditorContent(editor)).not.toContain("onerror");
  } finally {
    editor.destroy();
  }
});

it("strips script handlers from pasted quoted mail", () => {
  const editor = new Editor({
    extensions: richTextEditorExtensions,
    content: "<p>Reply</p>",
  });

  try {
    // jsdom has no ClipboardEvent; only handlePaste props would read it.
    editor.view.pasteHTML(HOSTILE_QUOTE, new Event("paste") as ClipboardEvent);
    expect(editor.view.dom.querySelector(".quoted-html-island")).not.toBeNull();
    expect(serializeEditorContent(editor)).not.toContain("onerror");
  } finally {
    editor.destroy();
  }
});

it("drops script links but keeps web, mail, phone and relative links", () => {
  const editor = new Editor({
    extensions: richTextEditorExtensions,
    content:
      '<p><a href="java&#9;script:alert(1)">bad</a> <a href="https://solace.onl">web</a> <a href="mailto:a@solace.onl">mail</a> <a href="tel:+31">phone</a> <a href="/path">relative</a></p>',
  });

  try {
    const html = serializeEditorContent(editor);
    expect(html).not.toMatch(/script:/i);
    expect(html).toContain('href="https://solace.onl"');
    expect(html).toContain('href="mailto:a@solace.onl"');
    expect(html).toContain('href="tel:+31"');
    expect(html).toContain('href="/path"');
  } finally {
    editor.destroy();
  }
});

it("folds a reply's quoted message under its header line, opens and closes it, and leaves a forward open", () => {
  const reply = new Editor({
    extensions: richTextEditorExtensions,
    content: "<p>Thanks</p><div><p>On Nov 16, Maestro wrote:</p></div><div data-quoted-html><p>Quoted line</p></div>",
  });
  const forward = new Editor({
    extensions: richTextEditorExtensions,
    content: "<div>---------- Forwarded message ----------<br>From: peer@solace.test</div><div data-quoted-html><p>Forwarded line</p></div>",
  });

  try {
    const island = reply.view.dom.querySelector<HTMLElement>(".quoted-html-island");
    const toggle = reply.view.dom.querySelector<HTMLButtonElement>("button[aria-expanded]");
    expect(island?.hidden).toBe(true);
    expect(toggle?.textContent).toBe("On Nov 16, Maestro wrote");
    expect(toggle?.className).toContain("active:not-disabled:scale-[0.96]");

    toggle?.click();
    expect(island?.hidden).toBe(false);
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    toggle?.click();
    expect(island?.hidden).toBe(true);
    // Folding is view-only: the sent HTML still carries the quote.
    expect(serializeEditorContent(reply)).toContain("<div data-quoted-html><p>Quoted line</p></div>");

    reply.view.dom.querySelector<HTMLButtonElement>('button[aria-label="Remove quoted message"]')?.click();
    expect(serializeEditorContent(reply)).toBe("<p>Thanks</p>");

    expect(forward.view.dom.querySelector<HTMLElement>(".quoted-html-island")?.hidden).toBe(false);
    expect(forward.view.dom.querySelector("button[aria-expanded]")).toBeNull();
  } finally {
    reply.destroy();
    forward.destroy();
  }
});
