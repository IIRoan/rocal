import type { CalendarEvent } from "@workspace/calendar-core";

export const ENCRYPTED_EVENT_PLACEHOLDER_TITLE = "Encrypted event";

/** The `event-content` payload; colour and category are absent from ciphertext written before they moved inside it. */
export interface DecryptedEventContent {
  title?: string;
  description?: string | null;
  location?: string | null;
  color?: string | null;
  categoryId?: string | null;
}

export function withDecryptedEventContent(
  event: CalendarEvent,
  content: DecryptedEventContent,
): CalendarEvent {
  return {
    ...event,
    title:
      content.title?.trim() ||
      event.title?.trim() ||
      ENCRYPTED_EVENT_PLACEHOLDER_TITLE,
    description: content.description ?? null,
    location: content.location ?? null,
    // A plaintext copy still on the row is older ciphertext's, or an older app's later write.
    color: event.color || content.color || event.color,
    categoryId: event.categoryId || content.categoryId || event.categoryId,
  };
}

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
