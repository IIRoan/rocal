export const MAILBOX_MESSAGES_PAGE_SIZE = 30;

/** Older pages cap body values so scrolling back stays light; readers refetch truncated messages in full. */
export const OLDER_PAGE_MAX_BODY_VALUE_BYTES = 32 * 1024;

/** Start loading the next page while this many rows are still below the viewport. */
export const MAILBOX_PREFETCH_AHEAD_ROWS = MAILBOX_MESSAGES_PAGE_SIZE;

/** Viewport lengths from the end at which the list asks for more, roughly one page of rows. */
export const MAILBOX_END_REACHED_THRESHOLD = 3;

export function mailboxPageMaxBodyValueBytes(
  position: number,
): number | undefined {
  return position > 0 ? OLDER_PAGE_MAX_BODY_VALUE_BYTES : undefined;
}

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
