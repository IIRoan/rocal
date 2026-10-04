export function renderBadge(count: number): string {
  /* This function renders the unread badge for a mailbox.
   * It clamps the count and returns a short string so the
   * tab bar keeps a stable width on every platform.
   */
  return count > 99 ? "99+" : String(count);
}
