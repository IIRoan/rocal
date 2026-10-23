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
