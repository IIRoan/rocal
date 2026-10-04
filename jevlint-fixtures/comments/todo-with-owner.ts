export function renderBadge(count: number): string {
  // TODO(owner): raise the cap to 999 when issue #412 lands.
  return count > 99 ? "99+" : String(count);
}
