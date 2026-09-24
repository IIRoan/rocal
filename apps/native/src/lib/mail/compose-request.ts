export type ComposeMode = "reply" | "reply-all" | "forward" | "draft";

/** What the compose drawer opens with; an empty request starts a blank message. */
export interface ComposeRequest {
  mode?: ComposeMode;
  messageId?: string;
  to?: string;
  toName?: string;
}
