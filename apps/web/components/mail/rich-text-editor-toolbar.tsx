"use client";

import { useEffect, useReducer, useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import { DROPDOWN_PANEL_ROW_CLASS, DropdownPanel } from "@workspace/ui/solace";
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
  X,
} from "lucide-react";
import { TableSizePicker } from "./rich-text-editor-table-picker";
import { SimpleTooltip, Tooltip, TooltipTrigger, TooltipContent } from "@workspace/ui/components/ui/tooltip";

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
    <SimpleTooltip content={title}>
      <button
        type="button"
        aria-label={title}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "inline-flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--icon-secondary)] hover:bg-[var(--bg-overlay-secondary)] disabled:opacity-40",
          active && "bg-[var(--bg-overlay-secondary)] text-[var(--icon-primary)]",
        )}
      >
        {children}
      </button>
    </SimpleTooltip>
  );
}

function ToolbarSeparator() {
  return <span className="mx-1 h-6 w-px shrink-0 bg-[var(--border-primary)]" />;
}

function TableMenu({
  editor,
  disabled,
  open,
  onOpenChange,
}: {
  editor: Editor;
  disabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const close = () => onOpenChange(false);
  return (
    <Tooltip>
      <DropdownPanel
        open={open}
        onOpenChange={onOpenChange}
        align="start"
        className="z-[100] p-1"
        onOpenAutoFocus={(event) => event.preventDefault()}
        trigger={
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Table"
              disabled={disabled}
              className={cn(
                "inline-flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--icon-secondary)] hover:bg-[var(--bg-overlay-secondary)] disabled:opacity-40",
                editor.isActive("table") &&
                  "bg-[var(--bg-overlay-secondary)] text-[var(--icon-primary)]",
              )}
            >
              <TableIcon className="size-3.5" strokeWidth={2.25} />
            </button>
          </TooltipTrigger>
        }
      >
          {editor.isActive("table") ? (
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                className={DROPDOWN_PANEL_ROW_CLASS}
                onClick={() => {
                  editor.chain().focus().addRowBefore().run();
                  close();
                }}
              >
                <Rows3 className="size-4 text-[var(--icon-secondary)]" /> Add row above
              </button>
              <button
                type="button"
                className={DROPDOWN_PANEL_ROW_CLASS}
                onClick={() => {
                  editor.chain().focus().addRowAfter().run();
                  close();
                }}
              >
                <Rows3 className="size-4 text-[var(--icon-secondary)]" /> Add row below
              </button>
              <button
                type="button"
                className={DROPDOWN_PANEL_ROW_CLASS}
                onClick={() => {
                  editor.chain().focus().addColumnBefore().run();
                  close();
                }}
              >
                <Columns3 className="size-4 text-[var(--icon-secondary)]" /> Add column before
              </button>
              <button
                type="button"
                className={DROPDOWN_PANEL_ROW_CLASS}
                onClick={() => {
                  editor.chain().focus().addColumnAfter().run();
                  close();
                }}
              >
                <Columns3 className="size-4 text-[var(--icon-secondary)]" /> Add column after
              </button>
              <div className="-mx-1 my-1 h-px bg-[var(--border-tertiary)]" />
              <button
                type="button"
                className={DROPDOWN_PANEL_ROW_CLASS}
                onClick={() => {
                  editor.chain().focus().deleteRow().run();
                  close();
                }}
              >
                <Trash2 className="size-4 text-[var(--icon-secondary)]" /> Delete row
              </button>
              <button
                type="button"
                className={DROPDOWN_PANEL_ROW_CLASS}
                onClick={() => {
                  editor.chain().focus().deleteColumn().run();
                  close();
                }}
              >
                <Trash2 className="size-4 text-[var(--icon-secondary)]" /> Delete column
              </button>
              <button
                type="button"
                className={DROPDOWN_PANEL_ROW_CLASS}
                onClick={() => {
                  editor.chain().focus().toggleHeaderRow().run();
                  close();
                }}
              >
                <Rows3 className="size-4 text-[var(--icon-secondary)]" /> Toggle header row
              </button>
              <div className="-mx-1 my-1 h-px bg-[var(--border-tertiary)]" />
              <button
                type="button"
                className={cn(DROPDOWN_PANEL_ROW_CLASS, "text-[var(--text-destructive)]")}
                onClick={() => {
                  editor.chain().focus().deleteTable().run();
                  close();
                }}
              >
                <Trash2 className="size-4 text-[var(--icon-secondary)]" /> Delete table
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
                close();
              }}
            />
          )}
      </DropdownPanel>
      <TooltipContent>Table</TooltipContent>
    </Tooltip>
  );
}

type RichTextEditorToolbarProps = {
  editor: Editor;
  disabled: boolean;
  onClose: () => void;
};

export function RichTextEditorToolbar({
  editor,
  disabled,
  onClose,
}: RichTextEditorToolbarProps) {
  const [tableMenuOpen, setTableMenuOpen] = useState(false);
  const [, refreshMarks] = useReducer((version: number) => version + 1, 0);

  useEffect(() => {
    const refresh = () => refreshMarks();
    editor.on("selectionUpdate", refresh);
    editor.on("transaction", refresh);
    return () => {
      editor.off("selectionUpdate", refresh);
      editor.off("transaction", refresh);
    };
  }, [editor]);

  const applyHeading = (level: 1 | 2) => {
    const { empty } = editor.state.selection;
    const chain = editor.chain().focus();
    if (empty) chain.setHeading({ level }).run();
    else chain.toggleHeading({ level }).run();
  };

  const addLink = () => {
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
  };

  return (
    <div className="flex h-11 w-full shrink-0 items-center border-t border-[var(--border-tertiary)] bg-[var(--bg-overlay-tertiary)] pl-4 pr-2">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
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

      <TableMenu
        editor={editor}
        disabled={disabled}
        open={tableMenuOpen}
        onOpenChange={setTableMenuOpen}
      />

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
      <button
        type="button"
        aria-label="Close formatting"
        onClick={onClose}
        className="ml-1 inline-flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--icon-secondary)] hover:bg-[var(--bg-overlay-secondary)]"
      >
        <X className="size-3.5" strokeWidth={2.25} />
      </button>
    </div>
  );
}
