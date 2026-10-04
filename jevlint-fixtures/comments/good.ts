export function renderBadge(count: number): string {
  // Cap the badge at 99+ so the tab width stays stable on every platform.
  return count > 99 ? "99+" : String(count);
}
