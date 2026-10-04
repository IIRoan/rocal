export function firstTitle(events: readonly [{ title: string }]): string {
  return events[0].title;
}
