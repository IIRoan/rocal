import type { Editor } from "@tiptap/core";

/** Links the selection (or the link under the caret) to `href`, inserts `href` as linked text when nothing is selected, or unlinks on null. */
export function setMailEditorLink(editor: Editor, href: string | null): void {
  const chain = editor.chain().focus();
  if (!href) {
    chain.extendMarkRange("link").unsetLink().run();
    return;
  }
  if (editor.state.selection.empty && !editor.isActive("link")) {
    chain.insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
    return;
  }
  chain.extendMarkRange("link").setLink({ href }).run();
}
