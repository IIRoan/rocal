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
