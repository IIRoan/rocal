import { guardMailKeywords, type MailKeywordGuard } from "@workspace/calendar-core";
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

/** Merge a refreshed first page with loaded messages without discarding tail pages or reintroducing stale drafts. */
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

/** Applies a first page requested earlier to the list as it is now, so rows removed or added while it was in flight keep their local fate. */
export function mergeRefreshedIntoCurrentMessages(input: {
  started: JmapEmailMessage[];
  current: JmapEmailMessage[];
  refreshed: JmapEmailMessage[];
  previousTotal: number;
  newTotal: number;
  keywordGuard?: MailKeywordGuard;
}): JmapEmailMessage[] {
  const { keywordGuard } = input;
  const startedIds = new Set(input.started.map((message) => message.id));
  const currentById = new Map(
    input.current.map((message) => [message.id, message]),
  );
  // A row listed when the request began but gone now was moved or deleted here since; the earlier page must not bring it back.
  const refreshed = input.refreshed
    .filter(
      (message) => currentById.has(message.id) || !startedIds.has(message.id),
    )
    .map((message) =>
      keywordGuard
        ? guardMailKeywords(message, currentById.get(message.id), keywordGuard)
        : message,
    );
  const refreshedIds = new Set(refreshed.map((message) => message.id));
  const known = input.current.filter(
    (message) => startedIds.has(message.id) || refreshedIds.has(message.id),
  );
  // A row that arrived while the request was in flight is newer than the page, so the page cannot drop it.
  const arrived = input.current.filter(
    (message) => !startedIds.has(message.id) && !refreshedIds.has(message.id),
  );
  return sortMessagesByReceivedAt([
    ...mergeRefreshedMailboxMessages(
      known,
      refreshed,
      input.previousTotal,
      input.newTotal,
    ),
    ...arrived,
  ]);
}
