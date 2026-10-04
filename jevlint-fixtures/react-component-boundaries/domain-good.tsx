declare function parseCalendar(
  icsText: string,
): ReadonlyArray<{ title: string; startsAt: string }>;

export function SubscriptionPreview({ icsText }: { icsText: string }) {
  const events = parseCalendar(icsText);
  return <span>{events.length} events</span>;
}
