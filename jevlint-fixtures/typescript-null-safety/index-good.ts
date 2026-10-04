export function firstTitle(events: ReadonlyArray<{ title: string }>): string {
  const first = events[0];
  return first ? first.title : "No events";
}
