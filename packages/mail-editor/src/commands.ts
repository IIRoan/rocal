import type { SignatureSource } from "@workspace/calendar-core";

/** Name of the page function the native app calls with one command. */
export const MAIL_EDITOR_COMMAND_FUNCTION = "__solaceMailEditor";

export type MailEditorFormat =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "bulletList"
  | "orderedList"
  | "blockquote"
  | "clearFormatting"
  | "undo"
  | "redo";

export type MailEditorCommand =
  | { type: "setContent"; html: string }
  | { type: "focus"; position: "start" | "end" }
  | { type: "format"; format: MailEditorFormat }
  | { type: "setLink"; href: string | null }
  | { type: "insertHtml"; html: string; afterSelection: boolean }
  | { type: "insertImage"; src: string; alt: string }
  | {
      type: "applySignature";
      candidates: SignatureSource[];
      next: SignatureSource | null;
      separator: boolean;
      aboveQuote: boolean;
      insert: boolean;
    }
  | { type: "setEditable"; editable: boolean }
  | { type: "updateImages"; sources: Record<string, string>; drop: string[] }
  | { type: "flush"; id: number };

export type MailEditorFormatState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  bulletList: boolean;
  orderedList: boolean;
  blockquote: boolean;
  link: string | null;
  hasSelection: boolean;
  canUndo: boolean;
  canRedo: boolean;
};

export type MailEditorEvent =
  | { type: "ready" }
  | { type: "baseline"; html: string }
  | { type: "change"; html: string }
  | { type: "flushed"; id: number; html: string }
  | { type: "state"; state: MailEditorFormatState }
  | { type: "focus" }
  | { type: "blur" };
