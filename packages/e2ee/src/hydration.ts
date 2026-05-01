import type { CalendarEvent } from "@workspace/calendar-core";

export const ENCRYPTED_EVENT_PLACEHOLDER_TITLE = "Encrypted event";

/**
 * Hydrate an encrypted event when no E2EE session is available.
 * Returns a placeholder with "Encrypted event" title (or the original
 * trimmed title if non-empty) and null description/location.
 *
 * If the event is not encrypted or has no encrypted content, it is
 * returned unchanged.
 */
export function hydrateEncryptedEventWithoutSession(
  event: CalendarEvent,
): CalendarEvent {
  if (
    event.encryptionState !== "encrypted" ||
    !event.encryptedContent ||
    typeof event.encryptedContent !== "string"
  ) {
    return event;
  }

  return {
    ...event,
    title: event.title?.trim() || ENCRYPTED_EVENT_PLACEHOLDER_TITLE,
    description: null,
    location: null,
    encryptionState: "encrypted",
  };
}
