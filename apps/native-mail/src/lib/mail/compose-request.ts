import type { ComposeTextFields, MailtoDraft } from "@workspace/calendar-core";
import type { PendingComposeAttachment } from "./compose-attachments";

export type ComposeMode = "reply" | "reply-all" | "forward" | "draft";

/** What the compose drawer opens with; an empty request starts a blank message. */
export interface ComposeRequest {
  mode?: ComposeMode;
  messageId?: string;
  to?: string;
  toName?: string;
  mailto?: MailtoDraft;
  /** Reopens an undone send from its in-memory form; `draftId` is the sealed copy moved back to Drafts. */
  restore?: { fields: ComposeTextFields; attachments: PendingComposeAttachment[]; draftId: string };
}
