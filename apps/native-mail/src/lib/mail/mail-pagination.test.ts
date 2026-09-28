import {
  MAILBOX_PREFETCH_AHEAD_ROWS,
  OLDER_PAGE_MAX_BODY_VALUE_BYTES,
  mailboxPageMaxBodyValueBytes,
  shouldPrefetchNextMailboxPage,
} from "./mail-pagination";

describe("mailboxPageMaxBodyValueBytes", () => {
  it("keeps the first page whole so recent mail opens from the list copy", () => {
    expect(mailboxPageMaxBodyValueBytes(0)).toBeUndefined();
  });

  it("caps bodies on older pages", () => {
    expect(mailboxPageMaxBodyValueBytes(30)).toBe(OLDER_PAGE_MAX_BODY_VALUE_BYTES);
  });
});

describe("shouldPrefetchNextMailboxPage", () => {
  const base = { rowCount: 90, hasNextPage: true, isFetchingNextPage: false };

  it("waits while more than a page of rows is still below the viewport", () => {
    const lastVisibleIndex = 89 - MAILBOX_PREFETCH_AHEAD_ROWS - 1;
    expect(shouldPrefetchNextMailboxPage({ ...base, lastVisibleIndex })).toBe(false);
  });

  it("loads ahead once the remaining rows drop to a page", () => {
    const lastVisibleIndex = 89 - MAILBOX_PREFETCH_AHEAD_ROWS;
    expect(shouldPrefetchNextMailboxPage({ ...base, lastVisibleIndex })).toBe(true);
  });

  it("loads right away when the first page is shorter than the look-ahead", () => {
    expect(
      shouldPrefetchNextMailboxPage({ ...base, rowCount: 24, lastVisibleIndex: 9 }),
    ).toBe(true);
  });

  it("never stacks requests or runs past the last page", () => {
    expect(
      shouldPrefetchNextMailboxPage({ ...base, isFetchingNextPage: true, lastVisibleIndex: 89 }),
    ).toBe(false);
    expect(
      shouldPrefetchNextMailboxPage({ ...base, hasNextPage: false, lastVisibleIndex: 89 }),
    ).toBe(false);
  });
});
