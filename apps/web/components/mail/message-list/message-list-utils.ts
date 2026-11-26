import type { JmapEmailMessage } from "@/lib/mail/types";
import { buildMailboxThreadRows } from "@/lib/mail/conversation-thread";
import { getAllMessageLabels } from "@/lib/mail/mail-labels";
import type { LabelDef } from "@/lib/mail/types";
import {
  buildMailPreviewSnippet,
  ENCRYPTED_MAIL_PREVIEW_PLACEHOLDER,
} from "@/lib/mail/mail-preview";
import { formatAddress } from "../mail-helpers";

export const ROW_HEIGHT_DESKTOP = 56;
export const ROW_HEIGHT_DESKTOP_COMFORTABLE = 72;
export const ROW_HEIGHT_WITH_LABELS = 56;
export const ROW_HEIGHT_WITH_LABELS_COMFORTABLE = 72;
export const ROW_HEIGHT_NARROW = 76;
export const DAY_HEADER_HEIGHT = 30;
export const SCROLL_LOAD_THRESHOLD = 62;

export type MessageListThreadRow = {
  id: string;
  messages: JmapEmailMessage[];
  messageIds: string[];
  latestMessage: JmapEmailMessage;
};

export type MessageListItem =
  | { kind: "day"; id: string; label: string; messageIds: string[] }
  | { kind: "row"; id: string; row: MessageListThreadRow };

/** A list row's preview line; encrypted mail shows only its subject, since the reader names the encryption. */
export function getListPreviewSnippet(message: JmapEmailMessage): string {
  const snippet = buildMailPreviewSnippet(message);
  return snippet === ENCRYPTED_MAIL_PREVIEW_PLACEHOLDER ? "" : snippet;
}

export function getRowHeight(
  message: JmapEmailMessage,
  labels: LabelDef[],
  isMobile: boolean,
  density: "compact" | "comfortable" = "compact",
  showLabelChips: boolean = true,
  narrow: boolean = false,
): number {
  // Phones render the same stacked row as the narrow desktop list, one height for every row: the preview and labels share the subject's line.
  if (isMobile || narrow) return ROW_HEIGHT_NARROW;
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

/** Up to two senders for a row's avatar stack, the latest first. */
export function getThreadAvatarSenders(
  messages: JmapEmailMessage[],
): { email: string; name?: string }[] {
  const newestFirst = [...messages].sort(
    (left, right) => Date.parse(right.receivedAt ?? "") - Date.parse(left.receivedAt ?? ""),
  );
  const senders: { email: string; name?: string }[] = [];
  for (const message of newestFirst) {
    const from = message.from?.[0];
    const email = from?.email?.toLowerCase();
    if (!email || senders.some((sender) => sender.email === email)) continue;
    senders.push({ email, name: from?.name ?? undefined });
    if (senders.length === 2) break;
  }
  return senders;
}

/** Rows under day headings, or bare rows when the order is search relevance rather than date. */
export function buildMessageListItems(
  rows: MessageListThreadRow[],
  dayLabelFor: ((row: MessageListThreadRow) => string) | null,
): MessageListItem[] {
  if (!dayLabelFor) return rows.map((row) => ({ kind: "row", id: row.id, row }));
  const items: MessageListItem[] = [];
  let day: Extract<MessageListItem, { kind: "day" }> | null = null;
  for (const row of rows) {
    const label = dayLabelFor(row);
    if (!day || day.label !== label) {
      day = { kind: "day", id: `day:${label}:${row.id}`, label, messageIds: [] };
      items.push(day);
    }
    day.messageIds.push(...row.messageIds);
    items.push({ kind: "row", id: row.id, row });
  }
  return items;
}
