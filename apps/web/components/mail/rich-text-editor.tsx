"use client";

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Paragraph from "@tiptap/extension-paragraph";
import Heading from "@tiptap/extension-heading";
import Underline from "@tiptap/extension-underline";
import { LiteralLink } from "./literal-link";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { ResizableImage } from "./resizable-image";
import { QuotedHtml, serializeEditorContent } from "./quoted-html";
import { cn } from "@workspace/ui/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  Undo,
  Redo,
  Quote,
  Code,
  RemoveFormatting,
  Heading1,
  Heading2,
  Table as TableIcon,
  Trash2,
  Rows3,
  Columns3,
} from "lucide-react";

export interface InlineImageUpload {
  src: string;
  cid?: string;
}

const styledBlockAttributes = {
  style: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute("style"),
    renderHTML: (attrs: Record<string, string | null>) =>
      attrs.style ? { style: attrs.style } : {},
  },
  class: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute("class"),
    renderHTML: (attrs: Record<string, string | null>) =>
      attrs.class ? { class: attrs.class } : {},
  },
  "data-signature-block": {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute("data-signature-block"),
    renderHTML: (attrs: Record<string, string | null>) =>
      attrs["data-signature-block"]
        ? { "data-signature-block": attrs["data-signature-block"] }
        : {},
  },
};

const StyledParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...styledBlockAttributes,
    };
  },
});

const StyledHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...styledBlockAttributes,
    };
  },
});

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  onImageUpload?: (file: File) => Promise<InlineImageUpload | null>;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  onEditorReady?: (editor: Editor) => void;
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
  children: ReactNode;
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

function ToolbarSeparator() {
  return <span className="mx-1 h-4 w-px bg-border/60" />;
}

const TABLE_PICKER_ROWS = 6;
const TABLE_PICKER_COLS = 8;

function TableSizePicker({
  onPick,
}: {
  onPick: (rows: number, cols: number) => void;
}) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  return (
    <div>
      <div
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${TABLE_PICKER_COLS}, 1fr)` }}
        onMouseLeave={() => setHover(null)}
      >
        {Array.from({ length: TABLE_PICKER_ROWS * TABLE_PICKER_COLS }).map(
          (_, i) => {
            const r = Math.floor(i / TABLE_PICKER_COLS);
            const c = i % TABLE_PICKER_COLS;
            const active = hover && r <= hover.r && c <= hover.c;
            return (
              <button
                key={i}
                type="button"
                onMouseEnter={() => setHover({ r, c })}
                onClick={() => onPick(r + 1, c + 1)}
                className={cn(
                  "size-4 rounded-[2px] border border-border/60 transition-colors",
                  active ? "border-primary bg-primary" : "bg-background hover:bg-muted/60",
                )}
              />
            );
          },
        )}
      </div>
      <div className="mt-1.5 text-center text-xs text-muted-foreground">
        {hover ? `${hover.r + 1} × ${hover.c + 1}` : "Pick size"}
      </div>
    </div>
  );
}

export function RichTextEditor({
  content,
  onChange,
  onImageUpload,
  placeholder = "Write your message…",
  className,
  disabled = false,
  onEditorReady,
}: RichTextEditorProps) {
  const onImageUploadRef = useRef(onImageUpload);
  onImageUploadRef.current = onImageUpload;
  const onEditorReadyRef = useRef(onEditorReady);
  onEditorReadyRef.current = onEditorReady;
  const editorRef = useRef<Editor | null>(null);
  const lastEmittedHtmlRef = useRef(content);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
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
    extensions: [
      StarterKit.configure({
        heading: false,
        paragraph: false,
        link: false,
        underline: false,
      }),
      StyledParagraph,
      StyledHeading.configure({ levels: [1, 2] }),
      Underline,
      LiteralLink,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      TextStyle,
      Color,
      ResizableImage,
      Placeholder.configure({ placeholder }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          border: "1",
          cellpadding: "6",
          cellspacing: "0",
          width: "100%",
          style: "width:100%;border-collapse:collapse;",
        },
      }),
      TableRow,
      TableHeader.configure({
        HTMLAttributes: {
          style:
            "padding:6px 8px;border:1px solid #ccc;background-color:#f5f5f5;color:#1f2937;text-align:left;",
        },
      }),
      TableCell.configure({
        HTMLAttributes: {
          style: "padding:6px 8px;border:1px solid #ccc;vertical-align:top;",
        },
      }),
      QuotedHtml,
    ],
    content,
    editable: !disabled,
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
      onChangeRef.current(html);
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

  const [tableMenuOpen, setTableMenuOpen] = useState(false);

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
      <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border/50 bg-muted/30 px-2 py-1.5">
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

        <ToolbarSeparator />

        <ToolbarButton
          title="Heading 1"
          disabled={disabled}
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => applyHeading(1)}
        >
          <Heading1 className="size-3.5" strokeWidth={2.25} />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 2"
          disabled={disabled}
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => applyHeading(2)}
        >
          <Heading2 className="size-3.5" strokeWidth={2.25} />
        </ToolbarButton>

        <ToolbarSeparator />

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
        <ToolbarButton
          title="Code block"
          disabled={disabled}
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <Code className="size-3.5" strokeWidth={2.25} />
        </ToolbarButton>

        <ToolbarSeparator />

        <ToolbarButton
          title="Align left"
          disabled={disabled}
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          <AlignLeft className="size-3.5" strokeWidth={2.25} />
        </ToolbarButton>
        <ToolbarButton
          title="Align center"
          disabled={disabled}
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          <AlignCenter className="size-3.5" strokeWidth={2.25} />
        </ToolbarButton>
        <ToolbarButton
          title="Align right"
          disabled={disabled}
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          <AlignRight className="size-3.5" strokeWidth={2.25} />
        </ToolbarButton>

        <ToolbarSeparator />

        <ToolbarButton
          title="Link"
          disabled={disabled}
          active={editor.isActive("link")}
          onClick={addLink}
        >
          <LinkIcon className="size-3.5" strokeWidth={2.25} />
        </ToolbarButton>

        <Popover open={tableMenuOpen} onOpenChange={setTableMenuOpen} modal={false}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Table"
              disabled={disabled}
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-40",
                editor.isActive("table") && "bg-muted text-foreground",
              )}
            >
              <TableIcon className="size-3.5" strokeWidth={2.25} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="z-[100] w-auto min-w-[200px] p-2"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            {editor.isActive("table") ? (
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted/60"
                  onClick={() => {
                    editor.chain().focus().addRowBefore().run();
                    setTableMenuOpen(false);
                  }}
                >
                  <Rows3 className="size-4" /> Add row above
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted/60"
                  onClick={() => {
                    editor.chain().focus().addRowAfter().run();
                    setTableMenuOpen(false);
                  }}
                >
                  <Rows3 className="size-4" /> Add row below
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted/60"
                  onClick={() => {
                    editor.chain().focus().addColumnBefore().run();
                    setTableMenuOpen(false);
                  }}
                >
                  <Columns3 className="size-4" /> Add column before
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted/60"
                  onClick={() => {
                    editor.chain().focus().addColumnAfter().run();
                    setTableMenuOpen(false);
                  }}
                >
                  <Columns3 className="size-4" /> Add column after
                </button>
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted/60"
                  onClick={() => {
                    editor.chain().focus().deleteRow().run();
                    setTableMenuOpen(false);
                  }}
                >
                  <Trash2 className="size-4" /> Delete row
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted/60"
                  onClick={() => {
                    editor.chain().focus().deleteColumn().run();
                    setTableMenuOpen(false);
                  }}
                >
                  <Trash2 className="size-4" /> Delete column
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted/60"
                  onClick={() => {
                    editor.chain().focus().toggleHeaderRow().run();
                    setTableMenuOpen(false);
                  }}
                >
                  <Rows3 className="size-4" /> Toggle header row
                </button>
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-destructive hover:bg-muted/60"
                  onClick={() => {
                    editor.chain().focus().deleteTable().run();
                    setTableMenuOpen(false);
                  }}
                >
                  <Trash2 className="size-4" /> Delete table
                </button>
              </div>
            ) : (
              <TableSizePicker
                onPick={(rows, cols) => {
                  editor
                    .chain()
                    .focus()
                    .insertTable({ rows, cols, withHeaderRow: true })
                    .run();
                  setTableMenuOpen(false);
                }}
              />
            )}
          </PopoverContent>
        </Popover>

        <ToolbarSeparator />

        <ToolbarButton
          title="Clear formatting"
          disabled={disabled}
          onClick={() =>
            editor.chain().focus().clearNodes().unsetAllMarks().run()
          }
        >
          <RemoveFormatting className="size-3.5" strokeWidth={2.25} />
        </ToolbarButton>

        <ToolbarSeparator />

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

      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
