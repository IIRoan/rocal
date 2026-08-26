import type { CreateEventRequest } from "@workspace/calendar-core";
import { createLogger } from "@workspace/logger";
import { calendarApiService } from "./api";

const log = createLogger("native:event-reminders");

export async function persistEventReminderNotifications(
  eventId: string,
  request: Pick<CreateEventRequest, "title" | "reminder">,
): Promise<void> {
  const minutes =
    typeof request.reminder === "number" && request.reminder > 0
      ? request.reminder
      : 0;

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
      { displayTitle: request.title },
    );
  } catch (error) {
    log.warn("Failed to persist event reminder title:", error);
  }
}
