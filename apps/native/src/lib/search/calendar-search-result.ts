import type {
  CalendarEvent,
  UnifiedCalendarSearchResult,
} from "@workspace/calendar-core";

export function toCalendarSearchResult(
  event: CalendarEvent,
  index: number,
): UnifiedCalendarSearchResult {
  const encryptionStatus =
    event.encryptionState === "encrypted"
      ? "encrypted-indexed"
      : event.encryptionState === "shadow_write"
        ? "metadata-only"
        : "plaintext";

  return {
    id: `calendar:${event.id}`,
    source: "calendar",
    eventId: event.id,
    title: event.title,
    snippet: event.location ?? event.description ?? undefined,
    timestamp:
      event.start instanceof Date
        ? event.start.toISOString()
        : new Date(event.start).toISOString(),
    score: 100 - index,
    encryptionStatus,
    matchedFields: ["calendar"],
    event,
  };
}
