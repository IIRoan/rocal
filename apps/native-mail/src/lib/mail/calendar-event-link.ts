import type { JmapEmailMessage } from "./types";
import { extractMessageBodies } from "./message-security";
import {
  extractLinkedCalendarEventId as extractLinkedCalendarEventIdFromSource,
  extractReminderLeadMinutes as extractReminderLeadMinutesFromSource,
  isSolaceEventReminderEmail as isSolaceEventReminderEmailFromSource,
  type CalendarEventLinkSource,
} from "@workspace/calendar-core";

export {
  extractReminderLeadMinutesFromSource as extractReminderLeadMinutes,
  isSolaceEventReminderEmailFromSource as isSolaceEventReminderEmail,
};

function toCalendarEventLinkSource(
  message: JmapEmailMessage,
  plaintext?: string | null,
): CalendarEventLinkSource {
  const bodies = extractMessageBodies(message);
  return {
    subject: message.subject,
    bodies: [
      plaintext ?? "",
      bodies.text ?? "",
      bodies.html ?? "",
      ...Object.values(message.bodyValues ?? {}).map(
        (bodyValue) => bodyValue.value ?? "",
      ),
    ],
  };
}

export function extractLinkedCalendarEventId(
  message: JmapEmailMessage,
  plaintext?: string | null,
): string | null {
  return extractLinkedCalendarEventIdFromSource(
    toCalendarEventLinkSource(message, plaintext),
  );
}

export function getCalendarEventLinkSource(
  message: JmapEmailMessage,
  plaintext?: string | null,
): CalendarEventLinkSource {
  return toCalendarEventLinkSource(message, plaintext);
}
