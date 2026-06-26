"use client";

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
} from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { serializeEditorContent } from "./quoted-html";
import { cn } from "@workspace/ui/lib/utils";
import { richTextEditorExtensions } from "./rich-text-editor-extensions";
import { RichTextEditorToolbar } from "./rich-text-editor-toolbar";

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
}

export function RichTextEditor({
  content,
  onChange,
  onImageUpload,
  className,
  disabled = false,
  onEditorReady,
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
  const [, rerenderToolbar] = useReducer((version: number) => version + 1, 0);

  const insertUploadedImage = useCallback(
    (result: InlineImageUpload, file: File, position?: number) => {
      const currentEditor = editorRef.current;
      if (!currentEditor) return;
      requestAnimationFrame(() => {
        if (currentEditor.isDestroyed) return;
        const attrs = {
          src: result.src,
          alt: file.name,
          cid: result.cid,
        };
        if (typeof position === "number") {
          currentEditor
            .chain()
            .focus()
            .insertContentAt(position, { type: "image", attrs })
            .run();
          return;
        }
        currentEditor
          .chain()
          .focus()
          .insertContent({ type: "image", attrs })
          .run();
      });
    },
    [],
  );

  const editor = useEditor({
    extensions: richTextEditorExtensions,
    content: "",
    editable: true,
    editorProps: {
      attributes: {
        class: "tiptap min-h-32 px-1 py-2 text-sm leading-relaxed outline-none",
      },
      handleDrop: (view, event) => {
        const upload = onImageUploadRef.current;
        if (!upload || !event.dataTransfer?.files?.length) return false;
        const imageFiles = Array.from(event.dataTransfer.files).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (imageFiles.length === 0) return false;
        event.preventDefault();
        event.stopPropagation();
        for (const file of imageFiles) {
          void upload(file).then((result) => {
            if (!result) return;
            const pos = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            })?.pos;
            insertUploadedImage(result, file, pos);
          });
        }
        return true;
      },
      handlePaste: (view, event) => {
        const upload = onImageUploadRef.current;
        if (!upload || !event.clipboardData?.files?.length) return false;
        const imageFiles = Array.from(event.clipboardData.files).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (imageFiles.length === 0) return false;
        event.preventDefault();
        for (const file of imageFiles) {
          void upload(file).then((result) => {
            if (result) {
              insertUploadedImage(result, file);
            }
          });
        }
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
    const refreshToolbar = () => {
      rerenderToolbar();
    };
    editor.on("selectionUpdate", refreshToolbar);
    editor.on("transaction", refreshToolbar);
    return () => {
      editor.off("selectionUpdate", refreshToolbar);
      editor.off("transaction", refreshToolbar);
    };
  }, [editor]);

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
      editor.commands.setContent(content, { emitUpdate: false });
      lastEmittedHtmlRef.current = content;
    });

    return () => cancelAnimationFrame(frame);
  }, [content, editor]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [disabled, editor]);

  useEffect(() => {
    editorRef.current = editor;
    if (editor) onEditorReadyRef.current?.(editor);
  }, [editor]);

  const addLink = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL", previousUrl ?? "");
    if (url === null) return;
    const trimmed = url.trim();
    if (!trimmed) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().setLink({ href: trimmed }).run();
  }, [editor]);

  const applyHeading = useCallback(
    (level: 1 | 2) => {
      if (!editor) return;
      const { empty } = editor.state.selection;
      const chain = editor.chain().focus();
      if (empty) {
        chain.setHeading({ level }).run();
      } else {
        chain.toggleHeading({ level }).run();
      }
    },
    [editor],
  );

  if (!editor) {
    return <div className={cn("min-h-32", className)} />;
  }

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border/50 bg-background",
        className,
      )}
    >
      <RichTextEditorToolbar
        editor={editor}
        disabled={disabled}
        applyHeading={applyHeading}
        addLink={addLink}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
