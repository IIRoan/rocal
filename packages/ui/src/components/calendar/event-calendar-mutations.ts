import { createLogger } from "@workspace/logger";
import { formatInUserTimezone } from "@workspace/calendar-core";
import { toast } from "sonner";

import type { CalendarEvent } from "./types";

const log = createLogger("event-calendar");

type EventMutationError = {
  details?: { message?: string }[];
  error?: string;
  message?: string;
  statusCode?: number;
};

function describeNetworkOrStatusError(
  error: EventMutationError,
  fallback: string,
) {
  return error?.message || fallback;
}

export function toastEventMutationError(
  error: EventMutationError,
  fallback: string,
  permissionMessage: string,
) {
  const errorMessage = describeNetworkOrStatusError(error, fallback);
  const isNetworkError =
    error?.error === "Network Error" ||
    error?.statusCode === 0 ||
    !navigator.onLine;

  if (isNetworkError) {
    toast.error("Network error", {
      description: "Please check your connection and try again",
      position: "bottom-left",
    });
    return;
  }

  if (error?.statusCode === 401) {
    toast.error("Authentication required", {
      description: "Please log in again to continue",
      position: "bottom-left",
    });
    return;
  }

  if (error?.statusCode === 403) {
    toast.error("Permission denied", {
      description: permissionMessage,
      position: "bottom-left",
    });
    return;
  }

  if (error?.details && error.details.length > 0) {
    toast.error("Validation error", {
      description: error.details.map((detail) => detail.message).join(", "),
      position: "bottom-left",
    });
    return;
  }

  if (error?.statusCode === 404) {
    toast.error("Event not found", {
      description: "This event may have already been deleted",
      position: "bottom-left",
    });
    return;
  }

  if (error?.statusCode === 400) {
    toast.error("Invalid request", {
      description: errorMessage,
      position: "bottom-left",
    });
    return;
  }

  toast.error(fallback, {
    description: errorMessage,
    position: "bottom-left",
  });
}

export async function persistDraggedCalendarEvent({
  timezone,
  updateEvent,
  updatedEvent,
}: {
  timezone: string;
  updateEvent: (id: string, event: unknown) => Promise<unknown>;
  updatedEvent: CalendarEvent;
}) {
  try {
    await updateEvent(updatedEvent.id, {
      title: updatedEvent.title,
      description: updatedEvent.description,
      start: updatedEvent.start.toISOString(),
      end: updatedEvent.end.toISOString(),
      allDay: updatedEvent.allDay,
      location: updatedEvent.location,
      color: updatedEvent.color,
    });

    toast.success(`Event "${updatedEvent.title}" moved`, {
      description: formatInUserTimezone(
        new Date(updatedEvent.start),
        timezone,
        "MMM d, yyyy 'at' h:mm a",
      ),
      position: "bottom-left",
    });
  } catch (error: unknown) {
    log.error("Failed to update event:", error);
    toastEventMutationError(
      error as EventMutationError,
      "Failed to move event",
      "You don't have permission to move this event",
    );
  }
}

export async function persistDeletedCalendarEvent({
  deleteEvent,
  eventId,
  events,
  timezone,
}: {
  deleteEvent: (id: string) => Promise<void>;
  eventId: string;
  events: CalendarEvent[];
  timezone: string;
}) {
  try {
    const deletedEvent = events.find((event) => event.id === eventId);
    await deleteEvent(eventId);

    if (deletedEvent) {
      toast.success(`Event "${deletedEvent.title}" deleted`, {
        description: formatInUserTimezone(
          new Date(deletedEvent.start),
          timezone,
          "MMM d, yyyy",
        ),
        position: "bottom-left",
      });
    }
  } catch (error: unknown) {
    log.error("Failed to delete event:", error);
    toastEventMutationError(
      error as EventMutationError,
      "Failed to delete event",
      "You don't have permission to delete this event",
    );
  }
}
