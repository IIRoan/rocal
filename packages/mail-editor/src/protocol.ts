import { z } from "@workspace/calendar-core/zod";
import {
  MAIL_EDITOR_COMMAND_FUNCTION,
  type MailEditorCommand,
  type MailEditorEvent,
  type MailEditorFormatState,
} from "./commands";

export {
  MAIL_EDITOR_COMMAND_FUNCTION,
  type MailEditorCommand,
  type MailEditorEvent,
  type MailEditorFormat,
  type MailEditorFormatState,
} from "./commands";

const formatStateSchema = z.strictObject({
  bold: z.boolean(),
  italic: z.boolean(),
  underline: z.boolean(),
  strike: z.boolean(),
  bulletList: z.boolean(),
  orderedList: z.boolean(),
  blockquote: z.boolean(),
  link: z.string().nullable(),
  hasSelection: z.boolean(),
  canUndo: z.boolean(),
  canRedo: z.boolean(),
});

/** What the editor page posts; the native side parses every message with this before acting on it. */
const mailEditorEventSchema: z.ZodType<MailEditorEvent> = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("ready") }),
  z.strictObject({ type: z.literal("baseline"), html: z.string() }),
  z.strictObject({ type: z.literal("change"), html: z.string() }),
  z.strictObject({ type: z.literal("flushed"), id: z.number().int(), html: z.string() }),
  z.strictObject({ type: z.literal("state"), state: formatStateSchema }),
  z.strictObject({ type: z.literal("focus") }),
  z.strictObject({ type: z.literal("blur") }),
]);

export const EMPTY_MAIL_EDITOR_FORMAT_STATE: MailEditorFormatState = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  bulletList: false,
  orderedList: false,
  blockquote: false,
  link: null,
  hasSelection: false,
  canUndo: false,
  canRedo: false,
};

export function parseMailEditorEvent(raw: string): MailEditorEvent | null {
  try {
    const parsed = mailEditorEventSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The script the native app injects to run one command in the editor page. */
export function mailEditorCommandScript(command: MailEditorCommand): string {
  return `window.${MAIL_EDITOR_COMMAND_FUNCTION}&&window.${MAIL_EDITOR_COMMAND_FUNCTION}(${JSON.stringify(command)});true;`;
}
