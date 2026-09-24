import { normalizeReminderMinutes } from "@workspace/calendar-core";
import { createLogger } from "@workspace/logger";
import { calendarApiService } from "./api";

const log = createLogger("native:event-reminders");

/** Returns reminder title ciphertext, or `undefined` when E2EE is unavailable. */
export type ReminderTitleEncryptor = (
  eventId: string,
  title: string,
) => Promise<string | null | undefined>;

export async function persistEventReminderNotifications(
  eventId: string,
  title: string | undefined,
  reminderMinutes: readonly number[],
  encryptTitle: ReminderTitleEncryptor,
): Promise<void> {
  const minutes = normalizeReminderMinutes(reminderMinutes);
  const trimmedTitle = title?.trim();
  // `null` clears the stored title; `undefined` leaves a title another device saved untouched.
  const encryptedDisplayTitle =
    minutes.length > 0 && trimmedTitle
      ? await encryptTitle(eventId, trimmedTitle).catch((error: unknown) => {
          log.warn("Failed to encrypt reminder title:", error);
          return undefined;
        })
      : null;

  try {
    await calendarApiService.updateEventNotifications(
      eventId,
      minutes.map((minutesBefore) => ({
        notificationType: "email",
        minutesBefore,
        isEnabled: true,
      })),
      { encryptedDisplayTitle },
    );
  } catch (error) {
    log.warn("Failed to persist event reminder notifications:", error);
  }
}
