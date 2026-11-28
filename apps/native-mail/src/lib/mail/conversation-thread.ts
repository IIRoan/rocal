import type { MailConversation as Thread } from "@workspace/calendar-core";
import type { JmapEmailMessage } from "./types";

export type MailConversation = Thread<JmapEmailMessage>;
export {
  buildMailboxThreadRows,
  buildMailConversations,
  filterRelatedThreadMessages,
  getConversationForMessage,
} from "@workspace/calendar-core";

function messageHasBodyPayload(message: JmapEmailMessage): boolean {
  return Boolean(
    message.bodyValues ||
      message.textBody?.length ||
      message.htmlBody?.length ||
      message.attachments?.length,
  );
}

function mergeMailMessage(
  existing: JmapEmailMessage,
  incoming: JmapEmailMessage,
): JmapEmailMessage {
  if (messageHasBodyPayload(incoming)) {
    const merged = { ...existing, ...incoming };
    // Rows carry part ids but no body text; they must not drop bodies the detail copy already loaded.
    if (!incoming.bodyValues && existing.bodyValues) {
      merged.bodyValues = existing.bodyValues;
    }
    return merged;
  }
  if (messageHasBodyPayload(existing)) {
    return {
      ...existing,
      ...incoming,
      bodyStructure: existing.bodyStructure,
      bodyValues: existing.bodyValues,
      textBody: existing.textBody,
      htmlBody: existing.htmlBody,
      attachments: existing.attachments,
    };
  }
  return { ...existing, ...incoming };
}

export function mergeConversationSourceMessages(
  ...messageSets: JmapEmailMessage[][]
): JmapEmailMessage[] {
  const byId = new Map<string, JmapEmailMessage>();
  for (const messageSet of messageSets) {
    for (const message of messageSet) {
      const existing = byId.get(message.id);
      byId.set(
        message.id,
        existing ? mergeMailMessage(existing, message) : message,
      );
    }
  }
  return [...byId.values()].sort(
    (left, right) => (left.receivedAt ? Date.parse(left.receivedAt) : 0) -
      (right.receivedAt ? Date.parse(right.receivedAt) : 0),
  );
}

export function sameItems<T>(left: readonly T[], right: readonly T[]): boolean {
  return (
    left === right ||
    (left.length === right.length &&
      left.every((item, index) => item === right[index]))
  );
}

/** Rows are rebuilt on every page append; this tells whether a row actually changed. */
export function sameMailConversation(
  left: MailConversation,
  right: MailConversation,
): boolean {
  return (
    left === right ||
    (left.id === right.id &&
      left.latestMessage === right.latestMessage &&
      sameItems(left.messages, right.messages))
  );
}
