"use client";

import {
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { Editor } from "@tiptap/react";
import { setMailEditorLink } from "@workspace/mail-editor";
import { DROPDOWN_PANEL_ROW_CLASS, DropdownPanel } from "@workspace/ui/solace";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { cn } from "@workspace/ui/lib/utils";
import type { InlineImageUpload } from "./rich-text-editor";
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
  ZoomIn,
  ZoomOut,
  ImagePlus,
} from "lucide-react";
import { TableSizePicker } from "./rich-text-editor-table-picker";
import { SimpleTooltip, Tooltip, TooltipTrigger, TooltipContent } from "@workspace/ui/components/ui/tooltip";

const TOOLBAR_KEYS = ["ArrowLeft", "ArrowRight", "Home", "End"];

/** APG toolbar: one Tab stop, arrow keys move between the enabled buttons. */
function moveToolbarFocus(event: KeyboardEvent<HTMLDivElement>) {
  if (!TOOLBAR_KEYS.includes(event.key)) return;
  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
  );
  const current = buttons.findIndex((button) => button === document.activeElement);
  if (current < 0) return;
  event.preventDefault();
  const step = event.key === "ArrowRight" ? 1 : -1;
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (current + step + buttons.length) % buttons.length;
  buttons[next]?.focus();
}

function resizeSelectedImage(editor: Editor, factor: number) {
  const node = editor.view.nodeDOM(editor.state.selection.from);
  const width =
    node instanceof HTMLElement ? node.querySelector("img")?.offsetWidth : 0;
  if (!width) return;
  editor
    .chain()
    .focus()
    .updateAttributes("image", { width: Math.max(50, Math.round(width * factor)) })
    .run();
}

function ToolbarButton({
  active,
  onClick,
  children,
  title,
  disabled,
  tabStop = false,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  title: string;
  disabled?: boolean;
  tabStop?: boolean;
}) {
  return (
    <SimpleTooltip content={title}>
      <button
        type="button"
        aria-label={title}
        aria-pressed={active}
        tabIndex={tabStop ? 0 : -1}
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
        trigger={
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Table"
              tabIndex={-1}
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

function LinkMenu({
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
  const fieldId = useId();
  const [href, setHref] = useState("");
  const active = editor.isActive("link");
  const changeOpen = (next: boolean) => {
    if (next) setHref((editor.getAttributes("link").href as string | undefined) ?? "");
    onOpenChange(next);
  };
  const apply = (next: string | null) => {
    setMailEditorLink(editor, next);
    onOpenChange(false);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    apply(href.trim() || null);
  };
  return (
    <Tooltip>
      <DropdownPanel
        open={open}
        onOpenChange={changeOpen}
        align="start"
        width={288}
        className="z-[100] p-3"
        trigger={
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Link"
              aria-pressed={active}
              tabIndex={-1}
              disabled={disabled}
              className={cn(
                "inline-flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--icon-secondary)] hover:bg-[var(--bg-overlay-secondary)] disabled:opacity-40",
                active && "bg-[var(--bg-overlay-secondary)] text-[var(--icon-primary)]",
              )}
            >
              <LinkIcon className="size-3.5" strokeWidth={2.25} />
            </button>
          </TooltipTrigger>
        }
      >
        <form onSubmit={submit} className="flex flex-col gap-2">
          <label htmlFor={fieldId} className="text-xs font-medium text-muted-foreground">
            Link address
          </label>
          <Input
            id={fieldId}
            value={href}
            onChange={(event) => setHref(event.target.value)}
            placeholder="https://"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            className="h-8 text-sm"
          />
          <div className="flex justify-end gap-2">
            {active ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => apply(null)}>
                Remove link
              </Button>
            ) : null}
            <Button type="submit" size="sm" disabled={!href.trim()}>
              Apply
            </Button>
          </div>
        </form>
      </DropdownPanel>
      <TooltipContent>Link</TooltipContent>
    </Tooltip>
  );
}

type RichTextEditorToolbarProps = {
  editor: Editor;
  disabled: boolean;
  onImageUpload?: (file: File) => Promise<InlineImageUpload | null>;
  onClose: () => void;
};

export function RichTextEditorToolbar({
  editor,
  disabled,
  onImageUpload,
  onClose,
}: RichTextEditorToolbarProps) {
  const [tableMenuOpen, setTableMenuOpen] = useState(false);
  const [linkMenuOpen, setLinkMenuOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
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

  const insertImages = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/"));
    event.target.value = "";
    for (const file of files) {
      // onImageUpload (handleComposeImageUpload) reports failures itself and returns null.
      onImageUpload?.(file)
        .then((result) => {
          if (!result || editor.isDestroyed) return;
          editor
            .chain()
            .focus()
            .insertContent({ type: "image", attrs: { src: result.src, alt: file.name, cid: result.cid } })
            .run();
        })
        .catch(() => undefined);
    }
  };

  return (
    <div className="flex h-11 w-full shrink-0 items-center border-b border-[var(--border-tertiary)] pl-3 pr-2">
      <div
        role="toolbar"
        aria-label="Formatting"
        tabIndex={-1}
        onKeyDown={moveToolbarFocus}
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
      >
      <ToolbarButton
        title="Bold"
        tabStop
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

      <LinkMenu
        editor={editor}
        disabled={disabled}
        open={linkMenuOpen}
        onOpenChange={setLinkMenuOpen}
      />

      {onImageUpload ? (
        <>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            tabIndex={-1}
            aria-hidden
            onChange={insertImages}
          />
          <ToolbarButton
            title="Insert image"
            disabled={disabled}
            onClick={() => imageInputRef.current?.click()}
          >
            <ImagePlus className="size-3.5" strokeWidth={2.25} />
          </ToolbarButton>
        </>
      ) : null}

      <TableMenu
        editor={editor}
        disabled={disabled}
        open={tableMenuOpen}
        onOpenChange={setTableMenuOpen}
      />

      {editor.isActive("image") ? (
        <>
          <ToolbarButton
            title="Make image smaller"
            disabled={disabled}
            onClick={() => resizeSelectedImage(editor, 0.8)}
          >
            <ZoomOut className="size-3.5" strokeWidth={2.25} />
          </ToolbarButton>
          <ToolbarButton
            title="Make image larger"
            disabled={disabled}
            onClick={() => resizeSelectedImage(editor, 1.25)}
          >
            <ZoomIn className="size-3.5" strokeWidth={2.25} />
          </ToolbarButton>
        </>
      ) : null}

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
