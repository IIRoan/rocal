import type { EventsResponse } from "@workspace/calendar-core";

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    deduped.push(item);
  }

  return deduped;
}

export function mergeMonthEventResponses(
  responses: Array<EventsResponse | undefined>,
): EventsResponse {
  const merged = responses.filter(Boolean) as EventsResponse[];

  return {
    events: dedupeById(merged.flatMap((response) => response.events)),
    calendars: dedupeById(merged.flatMap((response) => response.calendars)),
    categories: dedupeById(merged.flatMap((response) => response.categories)),
  };
}
