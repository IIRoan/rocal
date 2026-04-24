import { format } from "date-fns";
import type {
  Calendar,
  CalendarEvent,
  EventNotification,
} from "@workspace/ui/components/calendar";

import type {
  EventEncryptionMode,
  RecurrenceRule,
} from "./types/calendar";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type EventEditorEncryptionPreviewInput = {
  enabledNotificationCount: number;
  eventEncryptionMode?: EventEncryptionMode | null;
  hasActiveEncryptionSession: boolean;
  selectedCalendar?: Pick<Calendar, "forceFullEncryption"> | null;
};

export type EventEditorEncryptionPreview =
  | { encryptionState: "plaintext" | "shadow_write" | "encrypted" }
  | { forceFullEncryption: true };

export function buildEventEditorEncryptionPreview(
  input: EventEditorEncryptionPreviewInput,
): EventEditorEncryptionPreview {
  if (!input.hasActiveEncryptionSession) {
    return { encryptionState: "plaintext" };
  }

  if (input.selectedCalendar?.forceFullEncryption) {
    return { forceFullEncryption: true };
  }

  if (input.eventEncryptionMode === "full") {
    return { encryptionState: "encrypted" };
  }

  if (input.enabledNotificationCount > 0) {
    return { encryptionState: "shadow_write" };
  }

  return { encryptionState: "encrypted" };
}

export function formatReminderMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  if (minutes < 1440) {
    const hours = minutes / 60;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hour${hours === 1 ? "" : "s"}`;
  }

  if (minutes < 10080) {
    const days = minutes / 1440;
    return `${Number.isInteger(days) ? days : days.toFixed(1)} day${days === 1 ? "" : "s"}`;
  }

  const weeks = minutes / 10080;
  return `${Number.isInteger(weeks) ? weeks : weeks.toFixed(1)} week${weeks === 1 ? "" : "s"}`;
}

export function getEventDateDisplay(startDate: Date, endDate: Date) {
  const startLabel = format(startDate, "EEEE, MMMM d, yyyy");
  const endLabel = format(endDate, "EEEE, MMMM d, yyyy");

  if (startLabel === endLabel) {
    return {
      isSameDay: true,
      label: startLabel,
    };
  }

  return {
    endLabel: format(endDate, "EEE, MMM d, yyyy"),
    isSameDay: false,
    startLabel: format(startDate, "EEE, MMM d"),
  };
}

export function getEnabledEmailReminderMinutes(
  notifications: Array<
    Pick<EventNotification, "isEnabled" | "minutesBefore" | "notificationType">
  >,
) {
  return notifications
    .filter(
      (notification) =>
        notification.isEnabled !== false &&
        notification.notificationType === "email",
    )
    .map((notification) => notification.minutesBefore)
    .sort((left, right) => left - right);
}

export function getRecurringRuleSummary(rule: RecurrenceRule): string {
  const { frequency, interval, count, until, byWeekDay } = rule;
  let description = "";

  if (interval === 1) {
    description = frequency.charAt(0).toUpperCase() + frequency.slice(1);
  } else {
    description = `Every ${interval} ${
      frequency === "daily"
        ? "days"
        : frequency === "weekly"
          ? "weeks"
          : frequency === "monthly"
            ? "months"
            : "years"
    }`;
  }

  if (frequency === "weekly" && byWeekDay && byWeekDay.length > 0) {
    const dayNames = byWeekDay.map((day) => WEEKDAY_SHORT[day]).join(", ");
    description += ` on ${dayNames}`;
  }

  if (count) {
    description += `, ${count} times`;
  } else if (until) {
    description += `, until ${format(new Date(until), "MMM d, yyyy")}`;
  }

  return description;
}

export function isRecurringEventDeleteCandidate(
  event:
    | Pick<
        CalendarEvent,
        "id" | "isRecurringInstance" | "parentEventId" | "recurrence"
      >
    | null
    | undefined,
) {
  return Boolean(
    event?.recurrence ||
      event?.isRecurringInstance ||
      event?.parentEventId ||
      (event?.id && event.id.includes("_")),
  );
}

export function canSaveEventEditor(input: {
  eventCalendarId: string;
  eventSaving: boolean;
  eventTitle: string;
}) {
  return (
    !input.eventSaving &&
    Boolean(input.eventCalendarId) &&
    input.eventTitle.trim().length > 0
  );
}