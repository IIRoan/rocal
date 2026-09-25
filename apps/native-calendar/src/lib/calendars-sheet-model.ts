import {
  partitionCalendarsByKind,
  type Calendar,
  type CalendarSubscription,
} from "@workspace/calendar-core";
import { formatLastSync, getSubscriptionType, sortSubscriptions } from "./subscription-utils";

export interface ReadOnlyCalendarEntry {
  subscription: CalendarSubscription;
  calendar: Calendar | undefined;
  kind: "holiday" | "external";
}

export interface CalendarsSheetModel {
  owned: Calendar[];
  holidays: ReadOnlyCalendarEntry[];
  feeds: ReadOnlyCalendarEntry[];
}

/** Owned calendars (default first, then by name) and read-only calendars split into holidays and feeds. */
export function buildCalendarsSheetModel(
  calendars: Calendar[],
  subscriptions: CalendarSubscription[],
): CalendarsSheetModel {
  const owned = [...partitionCalendarsByKind(calendars).ownedCalendars].sort((left, right) =>
    left.isDefault !== right.isDefault
      ? left.isDefault
        ? -1
        : 1
      : left.name.localeCompare(right.name),
  );
  const calendarById = new Map(calendars.map((calendar) => [calendar.id, calendar]));
  const entries = sortSubscriptions(subscriptions).map(
    (subscription): ReadOnlyCalendarEntry => ({
      subscription,
      calendar: calendarById.get(subscription.calendar.id),
      kind: getSubscriptionType(subscription),
    }),
  );

  return {
    owned,
    holidays: entries.filter((entry) => entry.kind === "holiday"),
    feeds: entries.filter((entry) => entry.kind === "external"),
  };
}

export const CALENDAR_NAME_MAX_LENGTH = 100;

export function validateCalendarName(name: string): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return "Calendar name is required";
  if (trimmed.length > CALENDAR_NAME_MAX_LENGTH) {
    return `Calendar name must be ${CALENDAR_NAME_MAX_LENGTH} characters or less`;
  }
  return undefined;
}

/** Secondary line for an owned calendar row; undefined when there is nothing to flag. */
export function ownedCalendarDetail(calendar: Calendar): string | undefined {
  const parts: string[] = [];
  if (calendar.isDefault) parts.push("Default");
  if (calendar.forceFullEncryption) parts.push("Encrypted");
  if (!calendar.isVisible) parts.push("Hidden");
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** Secondary line for a read-only calendar row: hidden flag plus sync state for feeds. */
export function readOnlyCalendarDetail(entry: ReadOnlyCalendarEntry): string | undefined {
  const parts: string[] = [];
  if (entry.calendar && !entry.calendar.isVisible) parts.push("Hidden");
  if (entry.kind === "external") {
    parts.push(
      entry.subscription.lastErrorMessage
        ? "Sync failed"
        : `Synced ${formatLastSync(entry.subscription.lastSyncAt).toLowerCase()}`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}
