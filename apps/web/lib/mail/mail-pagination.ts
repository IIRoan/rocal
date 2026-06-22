export const MAILBOX_MESSAGES_PAGE_SIZE = 50;

/** Whether another JMAP page is likely available after the current list. */
export function hasMoreMailboxMessages(
  loadedCount: number,
  totalCount: number,
  pageSize: number = MAILBOX_MESSAGES_PAGE_SIZE,
): boolean {
  if (totalCount > 0) {
    return loadedCount < totalCount;
  }

  return loadedCount > 0 && loadedCount % pageSize === 0;
}

/** Append the next mailbox page without duplicate ids. */
export function appendMailboxMessages(
  currentMessages: Array<{ id: string }>,
  nextMessages: Array<{ id: string }>,
): typeof nextMessages {
  if (nextMessages.length === 0) {
    return [];
  }

  const existingIds = new Set(currentMessages.map((message) => message.id));
  return nextMessages.filter((message) => !existingIds.has(message.id));
}
