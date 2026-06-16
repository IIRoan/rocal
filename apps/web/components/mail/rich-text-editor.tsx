"use client";

import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Link as LinkIcon,
  Undo,
  Redo,
  Quote,
  RemoveFormatting,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

function ToolbarButton({
  active,
  onClick,
  children,
  title,
  disabled,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-40",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  content,
  onChange,
  placeholder = "Write your message…",
  className,
  disabled = false,
}: RichTextEditorProps) {
  const lastEmittedHtmlRef = useRef(content);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
      }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) => {
      const html = currentEditor.getHTML();
      if (html === lastEmittedHtmlRef.current) {
        return;
      }
      lastEmittedHtmlRef.current = html;
      onChange(html);
    },
    onBlur: ({ editor: currentEditor }) => {
      const html = currentEditor.getHTML();
      if (html === lastEmittedHtmlRef.current) {
        return;
      }
      lastEmittedHtmlRef.current = html;
      onChange(html);
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    lastEmittedHtmlRef.current = content;
  }, [content]);

  useEffect(() => {
    if (!editor) return;
    if (content === lastEmittedHtmlRef.current) {
      return;
    }
    const current = editor.getHTML();
    if (content !== current) {
      editor.commands.setContent(content, { emitUpdate: false });
      lastEmittedHtmlRef.current = content;
    }
  }, [content, editor]);

  if (!editor) {
    return (
      <div
        className={cn(
          "min-h-32 animate-pulse rounded-md bg-muted/30",
          className,
        )}
      />
    );
  }

  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previous ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border/40 px-1 py-1 shrink-0">
        <ToolbarButton
          title="Bold"
          disabled={disabled}
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="size-3.5" strokeWidth={2.25} />
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          disabled={disabled}
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-3.5" strokeWidth={2.25} />
        </ToolbarButton>
        <ToolbarButton
          title="Underline"
          disabled={disabled}
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="size-3.5" strokeWidth={2.25} />
        </ToolbarButton>
        <ToolbarButton
          title="Strikethrough"
          disabled={disabled}
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="size-3.5" strokeWidth={2.25} />
        </ToolbarButton>
        <span className="mx-1 h-4 w-px bg-border/60" />
        <ToolbarButton
          title="Bullet list"
          disabled={disabled}
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="size-3.5" strokeWidth={2.25} />
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          disabled={disabled}
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-3.5" strokeWidth={2.25} />
        </ToolbarButton>
        <ToolbarButton
          title="Quote"
          disabled={disabled}
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="size-3.5" strokeWidth={2.25} />
        </ToolbarButton>
        <ToolbarButton title="Link" disabled={disabled} onClick={setLink}>
          <LinkIcon className="size-3.5" strokeWidth={2.25} />
        </ToolbarButton>
        <span className="mx-1 h-4 w-px bg-border/60" />
        <ToolbarButton
          title="Clear formatting"
          disabled={disabled}
          onClick={() =>
            editor.chain().focus().clearNodes().unsetAllMarks().run()
          }
        >
          <RemoveFormatting className="size-3.5" strokeWidth={2.25} />
        </ToolbarButton>
        <ToolbarButton
          title="Undo"
          disabled={disabled || !editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo className="size-3.5" strokeWidth={2.25} />
        </ToolbarButton>
        <ToolbarButton
          title="Redo"
          disabled={disabled || !editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo className="size-3.5" strokeWidth={2.25} />
        </ToolbarButton>
      </div>
      <EditorContent
        editor={editor}
        className="flex-1 overflow-y-auto px-1 py-2 text-sm leading-relaxed [&_.ProseMirror]:min-h-32 [&_.ProseMirror]:outline-none [&_.ProseMirror_p]:my-1 [&_.ProseMirror_ul]:my-1 [&_.ProseMirror_ol]:my-1 [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-border/60 [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_blockquote]:text-muted-foreground [&_.is-editor-empty:first-child::before]:text-muted-foreground/40 [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:pointer-events-none"
      />
    </div>
  );
}
