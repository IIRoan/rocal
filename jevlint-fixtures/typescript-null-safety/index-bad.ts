export function firstTitle(events: ReadonlyArray<{ title: string }>): string {
  return events[0].title;
}
