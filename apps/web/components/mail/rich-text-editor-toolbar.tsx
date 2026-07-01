"use client";

import { useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import { cn } from "@workspace/ui/lib/utils";
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
import { TableSizePicker } from "./rich-text-editor-table-picker";

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

type RichTextEditorToolbarProps = {
  editor: Editor;
  disabled: boolean;
  applyHeading: (level: 1 | 2) => void;
  addLink: () => void;
};

export function RichTextEditorToolbar({
  editor,
  disabled,
  applyHeading,
  addLink,
}: RichTextEditorToolbarProps) {
  const [tableMenuOpen, setTableMenuOpen] = useState(false);

  return (
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
  );
}
