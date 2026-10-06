import type { CalendarEvent } from "@workspace/calendar-core";

export const ENCRYPTED_EVENT_PLACEHOLDER_TITLE = "Encrypted event";

/** Placeholder for an encrypted event without an E2EE session: "Encrypted event" title with null description/location; unencrypted events pass through unchanged. */
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
