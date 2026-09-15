import type { CreateEventRequest } from "@workspace/calendar-core";
import { createLogger } from "@workspace/logger";
import { calendarApiService } from "./api";

const log = createLogger("native:event-reminders");

/** Returns reminder title ciphertext, or null when E2EE is unavailable. */
export type ReminderTitleEncryptor = (
  eventId: string,
  title: string,
) => Promise<string | null>;

export async function persistEventReminderNotifications(
  eventId: string,
  request: Pick<CreateEventRequest, "title" | "reminder">,
  encryptTitle: ReminderTitleEncryptor,
): Promise<void> {
  const minutes =
    typeof request.reminder === "number" && request.reminder > 0
      ? request.reminder
      : 0;

  const title = request.title?.trim();
  const encryptedDisplayTitle =
    minutes > 0 && title
      ? await encryptTitle(eventId, title).catch((error: unknown) => {
          // Reminder still saves; the lock screen falls back to generic copy.
          log.warn("Failed to encrypt reminder title:", error);
          return null;
        })
      : null;

  try {
    await calendarApiService.updateEventNotifications(
      eventId,
      minutes > 0
        ? [
            {
              notificationType: "email",
              minutesBefore: minutes,
              isEnabled: true,
            },
          ]
        : [],
      { encryptedDisplayTitle },
    );
  } catch (error) {
    log.warn("Failed to persist event reminder notifications:", error);
  }
}
