export function collectTitles(
  events: ReadonlyArray<{ title: string }>,
): string[] {
  const titles: string[] = [];
  for (const event of events) {
    titles.push(event.title);
  }
  return titles;
}
