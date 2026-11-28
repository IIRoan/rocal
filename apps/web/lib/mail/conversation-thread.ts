import type { MailConversation as Thread } from "@workspace/calendar-core";
import type { JmapEmailMessage } from "./types";

export type MailConversation = Thread<JmapEmailMessage>;
export {
  buildMailboxThreadRows,
  buildMailConversations,
  filterRelatedThreadMessages,
  getConversationForMessage,
} from "@workspace/calendar-core";
