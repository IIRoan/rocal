export function eventTitle(
  events: ReadonlyArray<{ id: string; title: string }>,
  id: string,
): string {
  const event = events.find((entry) => entry.id === id);
  return event?.title ?? "Event unavailable";
}
