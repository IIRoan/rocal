export function renderBadge(count: number): string {
  // Keep the badge narrow.
  return count > 99 ? "99+" : String(count);
}
