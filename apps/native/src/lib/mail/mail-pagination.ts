export const MAILBOX_MESSAGES_PAGE_SIZE = 30;

export function hasMoreMailboxMessages(
  loadedCount: number,
  totalCount: number,
): boolean {
  if (totalCount > 0) {
    return loadedCount < totalCount;
  }

  return (
    loadedCount > 0 && loadedCount % MAILBOX_MESSAGES_PAGE_SIZE === 0
  );
}

export function appendMailboxMessages<T extends { id: string }>(
  currentMessages: T[],
  nextMessages: T[],
): T[] {
  if (nextMessages.length === 0) {
    return [];
  }

  const existingIds = new Set(currentMessages.map((message) => message.id));
  return nextMessages.filter((message) => !existingIds.has(message.id));
}
