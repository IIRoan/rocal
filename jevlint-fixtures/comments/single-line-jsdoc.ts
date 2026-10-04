export function copyEvent(event: { id: string }): { id: string } {
  /** A local key avoids mutating shared cached entries. */
  return { ...event };
}
