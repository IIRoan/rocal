export const MAILBOX_MESSAGES_PAGE_SIZE = 30;

/** Start loading the next page while this many rows are still below the viewport. */
export const MAILBOX_PREFETCH_AHEAD_ROWS = MAILBOX_MESSAGES_PAGE_SIZE;

/** Viewport lengths from the end at which the list asks for more, roughly one page of rows. */
export const MAILBOX_END_REACHED_THRESHOLD = 3;

export function shouldPrefetchNextMailboxPage(input: {
  lastVisibleIndex: number;
  rowCount: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  aheadRows?: number;
}): boolean {
  if (!input.hasNextPage || input.isFetchingNextPage) return false;
  const rowsBelow = input.rowCount - 1 - input.lastVisibleIndex;
  return rowsBelow <= (input.aheadRows ?? MAILBOX_PREFETCH_AHEAD_ROWS);
}
