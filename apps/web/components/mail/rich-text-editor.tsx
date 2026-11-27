"use client";

import { useEffect, useRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { Selection } from "@tiptap/pm/state";
import { serializeEditorContent } from "@workspace/mail-editor";
import { cn } from "@workspace/ui/lib/utils";
import { insertUploadedImages } from "@/lib/mail/compose-editor-utils";
import { richTextEditorExtensions } from "./rich-text-editor-extensions";

export interface InlineImageUpload {
  src: string;
  cid?: string;
}

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  onImageUpload?: (file: File) => Promise<InlineImageUpload | null>;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  onEditorReady?: (editor: Editor) => void;
  errorId?: string;
}

function editorAttributes(errorId?: string): Record<string, string> {
  return {
    class: "tiptap min-h-32 flex-1 rounded-sm bg-transparent px-1 py-2 text-sm leading-relaxed outline-none focus-visible:ring-0",
    role: "textbox",
    "aria-multiline": "true",
    "aria-label": "Message body",
    ...(errorId ? { "aria-invalid": "true", "aria-describedby": errorId } : {}),
  };
}

export function RichTextEditor({
  content,
  onChange,
  onImageUpload,
  className,
  disabled = false,
  onEditorReady,
  errorId,
}: RichTextEditorProps) {
  const onImageUploadRef = useRef<RichTextEditorProps["onImageUpload"]>(undefined);
  const onEditorReadyRef = useRef<RichTextEditorProps["onEditorReady"]>(undefined);
  const editorRef = useRef<Editor | null>(null);
  const lastEmittedHtmlRef = useRef("");
  const onChangeRef = useRef<RichTextEditorProps["onChange"]>(undefined);
  useEffect(() => {
    onImageUploadRef.current = onImageUpload;
    onEditorReadyRef.current = onEditorReady;
    onChangeRef.current = onChange;
  }, [onImageUpload, onEditorReady, onChange]);
  const editor = useEditor({
    extensions: richTextEditorExtensions,
    content: "",
    editable: true,
    editorProps: {
      attributes: editorAttributes(),
      handleDrop: (view, event) => {
        const upload = onImageUploadRef.current;
        const currentEditor = editorRef.current;
        if (!upload || !currentEditor || !event.dataTransfer?.files?.length) return false;
        const imageFiles = Array.from(event.dataTransfer.files).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (imageFiles.length === 0) return false;
        event.preventDefault();
        event.stopPropagation();
        insertUploadedImages(currentEditor, imageFiles, upload, () =>
          view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos,
        );
        return true;
      },
      handlePaste: (_view, event) => {
        const upload = onImageUploadRef.current;
        const currentEditor = editorRef.current;
        if (!upload || !currentEditor || !event.clipboardData?.files?.length) return false;
        const imageFiles = Array.from(event.clipboardData.files).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (imageFiles.length === 0) return false;
        event.preventDefault();
        insertUploadedImages(currentEditor, imageFiles, upload);
        return true;
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const html = serializeEditorContent(currentEditor);
      if (html === lastEmittedHtmlRef.current) {
        return;
      }
      lastEmittedHtmlRef.current = html;
      onChangeRef.current?.(html);
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editor) return;
    if (content === lastEmittedHtmlRef.current) return;

    const frame = requestAnimationFrame(() => {
      if (!editor || editor.isDestroyed) return;
      const current = serializeEditorContent(editor);
      if (content === current) {
        lastEmittedHtmlRef.current = content;
        return;
      }
      const { from } = editor.state.selection;
      editor.commands.setContent(content, { emitUpdate: false });
      // setContent leaves the caret after the new content; it goes back where it was, the top of a freshly opened compose.
      const { doc, tr } = editor.state;
      editor.view.dispatch(tr.setSelection(Selection.near(doc.resolve(Math.min(from, doc.content.size)))));
      lastEmittedHtmlRef.current = content;
    });

    return () => cancelAnimationFrame(frame);
  }, [content, editor]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled, false);
    }
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: editorAttributes(errorId),
      },
    });
  }, [editor, errorId]);

  useEffect(() => {
    editorRef.current = editor;
    if (editor) onEditorReadyRef.current?.(editor);
  }, [editor]);

  if (!editor) {
    return <div className={cn("min-h-32", className)} />;
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <EditorContent editor={editor} className="flex flex-1 flex-col" />
      </div>
    </div>
  );
}
