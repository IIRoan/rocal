import type { CreateEventRequest } from "@workspace/calendar-core";
import { createLogger } from "@workspace/logger";
import { calendarApiService } from "./api";

const log = createLogger("native:event-reminders");

/**
 * Returns reminder title ciphertext, or `undefined` when E2EE is unavailable
 * (the stored ciphertext is then left as it is).
 */
export type ReminderTitleEncryptor = (
  eventId: string,
  title: string,
) => Promise<string | null | undefined>;

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
  // `null` clears the stored title, `undefined` leaves it untouched. When this
  // device cannot encrypt (E2EE session not restored yet) we must not wipe a
  // title another device saved — the reminder still saves either way.
  const encryptedDisplayTitle =
    minutes > 0 && title
      ? await encryptTitle(eventId, title).catch((error: unknown) => {
          log.warn("Failed to encrypt reminder title:", error);
          return undefined;
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
