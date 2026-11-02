/** @jest-environment jsdom */

import { expect, it } from "@jest/globals";
import { Editor } from "@tiptap/core";
import { richTextEditorExtensions } from "../../components/mail/rich-text-editor-extensions";
import { serializeEditorContent } from "../../components/mail/quoted-html";

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

it("renders quoted mail as a block island in the app font, not an inline system-ui run", () => {
  const editor = new Editor({
    extensions: richTextEditorExtensions,
    content: "<p>Reply</p><div data-quoted-html><p>Quoted line</p></div>",
  });

  try {
    const island = editor.view.dom.querySelector(".quoted-html-island");
    const css = island?.shadowRoot?.querySelector("style")?.textContent ?? "";
    const host = css.slice(css.indexOf(":host"), css.indexOf("}"));
    // `all: initial` resets every property declared before it, so block display must follow it.
    expect(host.indexOf("all: initial")).toBeLessThan(
      host.indexOf("display: block"),
    );
    expect(host).toContain("font-family: var(--font-sans)");
    expect(css).not.toContain("system-ui");
  } finally {
    editor.destroy();
  }
});

const HOSTILE_QUOTE = '<div data-quoted-html><p>Quoted line</p><img src="x" onerror="window.alert(1)"></div>';

function quotedIslandHandlers(editor: Editor): Element[] {
  return Array.from(editor.view.dom.querySelectorAll(".quoted-html-island")).flatMap((island) =>
    Array.from(island.shadowRoot?.querySelectorAll("[onerror]") ?? []),
  );
}

it("strips script handlers from quoted mail before it reaches the page or the outgoing body", () => {
  const editor = new Editor({
    extensions: richTextEditorExtensions,
    content: `<p>Reply</p>${HOSTILE_QUOTE}`,
  });

  try {
    expect(quotedIslandHandlers(editor)).toEqual([]);
    expect(editor.view.dom.querySelector(".quoted-html-island")?.shadowRoot?.textContent).toContain("Quoted line");
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
    expect(quotedIslandHandlers(editor)).toEqual([]);
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
