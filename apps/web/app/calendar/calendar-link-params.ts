export function readCalendarLinkSearchParams(searchParams: {
  get: (name: string) => string | null;
}) {
  return {
    eventId: searchParams.get("eventId"),
    palette: searchParams.get("palette"),
  };
}
