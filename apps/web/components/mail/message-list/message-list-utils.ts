import type { JmapEmailMessage } from "@/lib/mail/types";
import { buildMailConversations } from "@/lib/mail/conversation-thread";
import { getAllMessageLabels } from "@/lib/mail/mail-labels";
import type { LabelDef } from "@/lib/mail/types";
import { formatAddress } from "../mail-helpers";

export const ROW_HEIGHT_MOBILE = 60;
export const ROW_HEIGHT_DESKTOP = 68;
export const ROW_HEIGHT_DESKTOP_COMFORTABLE = 84;
export const ROW_HEIGHT_MOBILE_COMFORTABLE = 76;
export const ROW_HEIGHT_WITH_LABELS = 80;
export const ROW_HEIGHT_WITH_LABELS_COMFORTABLE = 96;
export const SCROLL_LOAD_THRESHOLD = 62;

export type MessageListThreadRow = {
  id: string;
  messages: JmapEmailMessage[];
  messageIds: string[];
  latestMessage: JmapEmailMessage;
};

export function getRowHeight(
  message: JmapEmailMessage,
  labels: LabelDef[],
  isMobile: boolean,
  density: "compact" | "comfortable" = "compact",
  showLabelChips: boolean = true,
): number {
  const hasLabels =
    showLabelChips && getAllMessageLabels(message, labels).length > 0;
  if (density === "comfortable") {
    if (hasLabels) return ROW_HEIGHT_WITH_LABELS_COMFORTABLE;
    return isMobile
      ? ROW_HEIGHT_MOBILE_COMFORTABLE
      : ROW_HEIGHT_DESKTOP_COMFORTABLE;
  }
  if (hasLabels) return ROW_HEIGHT_WITH_LABELS;
  return isMobile ? ROW_HEIGHT_MOBILE : ROW_HEIGHT_DESKTOP;
}

export function formatThreadSenders(messages: JmapEmailMessage[]): string {
  const uniqueSenders = Array.from(
    new Set(messages.map((message) => formatAddress(message.from))),
  );

  if (uniqueSenders.length <= 2) {
    return uniqueSenders.join(", ");
  }

  return `${uniqueSenders.slice(0, 2).join(", ")} +${uniqueSenders.length - 2}`;
}

export function buildMessageListThreadRows(
  messages: JmapEmailMessage[],
  relatedMessages: JmapEmailMessage[],
  preserveMessageOrder: boolean,
): MessageListThreadRow[] {
  const seenIds = new Set(messages.map((message) => message.id));
  const extras = preserveMessageOrder
    ? []
    : relatedMessages.filter((message) => !seenIds.has(message.id));
  const conversations = buildMailConversations(
    preserveMessageOrder ? messages : [...messages, ...extras],
    { preserveMessageOrder },
  );
  const primaryIdSet = new Set(messages.map((message) => message.id));
  const messageOrder = new Map(
    messages.map((message, index) => [message.id, index]),
  );

  const rows: MessageListThreadRow[] = [];
  for (const conversation of conversations) {
    const primaryMessages = conversation.messages.filter((message) =>
      primaryIdSet.has(message.id),
    );
    if (primaryMessages.length === 0) continue;

    const latestPrimary = preserveMessageOrder
      ? primaryMessages.reduce((best, candidate) =>
          (messageOrder.get(candidate.id) ?? Infinity) <
          (messageOrder.get(best.id) ?? Infinity)
            ? candidate
            : best,
        )
      : primaryMessages.reduce((latest, candidate) =>
          Date.parse(candidate.receivedAt ?? "") >=
          Date.parse(latest.receivedAt ?? "")
            ? candidate
            : latest,
        );

    rows.push({ ...conversation, latestMessage: latestPrimary });
  }

  return rows;
}

export function getSecondaryThreadMessages(
  threadMessages: JmapEmailMessage[],
  latestMessageId: string,
): JmapEmailMessage[] {
  const secondary: JmapEmailMessage[] = [];
  for (const threadMessage of threadMessages) {
    if (threadMessage.id !== latestMessageId) {
      secondary.push(threadMessage);
    }
  }
  return secondary;
}
