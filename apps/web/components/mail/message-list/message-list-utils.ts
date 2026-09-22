import type { JmapEmailMessage } from "@/lib/mail/types";
import { buildMailboxThreadRows } from "@/lib/mail/conversation-thread";
import { getAllMessageLabels } from "@/lib/mail/mail-labels";
import type { LabelDef } from "@/lib/mail/types";
import { formatAddress } from "../mail-helpers";

export const ROW_HEIGHT_MOBILE = 101;
export const ROW_HEIGHT_DESKTOP = 56;
export const ROW_HEIGHT_DESKTOP_COMFORTABLE = 72;
export const ROW_HEIGHT_MOBILE_COMFORTABLE = 101;
export const ROW_HEIGHT_WITH_LABELS = 56;
export const ROW_HEIGHT_WITH_LABELS_COMFORTABLE = 72;
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
  if (isMobile) {
    return density === "comfortable"
      ? ROW_HEIGHT_MOBILE_COMFORTABLE
      : ROW_HEIGHT_MOBILE;
  }
  const hasLabels =
    showLabelChips && getAllMessageLabels(message, labels).length > 0;
  if (density === "comfortable") {
    return hasLabels
      ? ROW_HEIGHT_WITH_LABELS_COMFORTABLE
      : ROW_HEIGHT_DESKTOP_COMFORTABLE;
  }
  return hasLabels ? ROW_HEIGHT_WITH_LABELS : ROW_HEIGHT_DESKTOP;
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
  return buildMailboxThreadRows(messages, relatedMessages, {
    preserveMessageOrder,
  });
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
