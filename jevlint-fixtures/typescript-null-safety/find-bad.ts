export function eventTitle(
  events: ReadonlyArray<{ id: string; title: string }>,
  id: string,
): string {
  return events.find((event) => event.id === id).title;
}
