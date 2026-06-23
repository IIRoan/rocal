import type { JmapEmailMessage } from "./types";
import { mergeMailMessage } from "./mail-message-body";

function getReceivedAtTime(message: JmapEmailMessage): number {
  return message.receivedAt ? Date.parse(message.receivedAt) : 0;
}

export function sortMessagesByReceivedAt(
  messages: JmapEmailMessage[],
): JmapEmailMessage[] {
  return [...messages].sort(
    (left, right) => getReceivedAtTime(right) - getReceivedAtTime(left),
  );
}

/**
 * Merge a refreshed first page with already-loaded messages without discarding
 * tail pages or reintroducing stale drafts (Bulwark refreshCurrentMailbox pattern).
 */
export function mergeRefreshedMailboxMessages(
  currentMessages: JmapEmailMessage[],
  refreshedFirstPage: JmapEmailMessage[],
  previousTotal: number,
  newTotal: number,
): JmapEmailMessage[] {
  if (currentMessages.length === 0) {
    return sortMessagesByReceivedAt(refreshedFirstPage);
  }

  const refreshedIds = new Set(refreshedFirstPage.map((message) => message.id));
  const currentById = new Map(currentMessages.map((message) => [message.id, message]));
  const merged: JmapEmailMessage[] = refreshedFirstPage.map((message) => {
    const existing = currentById.get(message.id);
    return existing ? mergeMailMessage(existing, message) : message;
  });

  const insertedCount = Math.max(newTotal - previousTotal, 0);
  const appendFromIndex = Math.max(
    refreshedFirstPage.length - insertedCount,
    0,
  );

  for (const message of currentMessages.slice(appendFromIndex)) {
    if (!refreshedIds.has(message.id)) {
      merged.push(message);
      refreshedIds.add(message.id);
    }
  }

  return sortMessagesByReceivedAt(merged);
}
