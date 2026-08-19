import { addDays } from "date-fns";
import type { CalendarView, DecoratedCalendarEvent } from "@workspace/calendar-core";
import {
  canCurrentUserModifyEvent,
  formatCalendarDayKey,
  getInclusiveCalendarDayRange,
  getThreeDayCalendarDays,
  getZonedDateParts,
  resolveTimezone,
  spansMultipleCalendarDays,
  utcToPickerDate,
} from "@workspace/calendar-core";

/**
 * Kit insets hour labels by the tick (8) plus 8px. `20:00` / `12 pm` must
 * stay on one line in that remaining width.
 */
export function toKitHourWidth(timeFormat: "12h" | "24h"): number {
  return timeFormat === "24h" ? 52 : 58;
}

export const KIT_HOUR_WIDTH = toKitHourWidth("24h");
export const KIT_HOUR_HEIGHT = 72;
export const KIT_INITIAL_HOUR = 9;
export const KIT_DRAG_STEP_MINUTES = 15;

export type TimelineKitView = Extract<CalendarView, "day" | "3day" | "week">;

export type KitWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type KitDateOrDateTime =
  | { date: string; dateTime?: never; timeZone?: never }
  | { dateTime: string; timeZone?: string; date?: never };

export type KitEventItem = {
  id: string;
  title?: string;
  color?: string;
  titleColor?: string;
  start: KitDateOrDateTime;
  end: KitDateOrDateTime;
  editable: boolean;
  encryptionState?: DecoratedCalendarEvent["encryptionState"];
};

export type KitCreateSlot = {
  date: string;
  hour: string;
};

export type KitDroppedEvent = {
  id: string;
  editable?: boolean;
  start?: KitDateOrDateTime;
  end?: KitDateOrDateTime;
};

export type KitRecurrenceEdit = {
  parentEventId: string;
  occurrenceDate: string;
};

export type KitEventMove = {
  eventId: string;
  start: string;
  end: string;
  recurrenceEdit?: KitRecurrenceEdit;
};

type KitDropOriginal = Pick<
  DecoratedCalendarEvent,
  | "id"
  | "userId"
  | "participants"
  | "isSynced"
  | "isCancelled"
  | "start"
  | "end"
  | "parentEventId"
  | "isRecurringInstance"
>;

const OCCURRENCE_ID_SUFFIX =
  /_(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)$/;

/**
 * Non-original instances use `parentId_ISODate`. Updating that id without a
 * recurrence scope rewrites to the parent and moves the whole series.
 */
export function resolveKitRecurrenceEdit(
  event: Pick<
    DecoratedCalendarEvent,
    "id" | "start" | "parentEventId" | "isRecurringInstance"
  >,
): KitRecurrenceEdit | null {
  const occurrenceMatch = event.id.match(OCCURRENCE_ID_SUFFIX);
  if (occurrenceMatch?.[1]) {
    return {
      parentEventId:
        event.parentEventId || event.id.slice(0, -occurrenceMatch[0].length),
      occurrenceDate: occurrenceMatch[1],
    };
  }

  if (event.parentEventId || event.isRecurringInstance) {
    return {
      parentEventId: event.parentEventId || event.id,
      occurrenceDate: toIsoInstant(event.start),
    };
  }

  return null;
}

function toIsoInstant(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function kitDateTime(value: KitDateOrDateTime | undefined): string | undefined {
  if (!value || !("dateTime" in value)) {
    return undefined;
  }

  return value.dateTime;
}

/**
 * Keep the original duration when kit rounding or a week-page jump drifts the end.
 */
export function preserveDroppedEventDuration(
  newStartIso: string,
  originalStart: Date | string,
  originalEnd: Date | string,
): string | null {
  const durationMs =
    new Date(originalEnd).getTime() - new Date(originalStart).getTime();

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }

  return new Date(new Date(newStartIso).getTime() + durationMs).toISOString();
}

/** Ignore kit page changes while an event is being dragged. */
export function shouldSyncTimelineDate(isDragging: boolean): boolean {
  return !isDragging;
}

/** After a drop, commit the destination day only when it actually changed. */
export function shouldCommitDragVisibleDate(
  destination: Date,
  currentDateKey: string,
): boolean {
  return toKitInitialDate(destination) !== currentDateKey;
}

export const KIT_NUMBER_OF_DAYS: Record<TimelineKitView, number> = {
  day: 1,
  "3day": 3,
  week: 7,
};

export function isTimelineKitView(view: CalendarView): view is TimelineKitView {
  return view === "day" || view === "3day" || view === "week";
}

export function toKitFirstDay(weekStartDay: number): KitWeekday {
  const normalized = ((weekStartDay % 7) + 7) % 7;
  return (normalized === 0 ? 7 : normalized) as KitWeekday;
}

export function toKitHourFormat(timeFormat: "12h" | "24h"): string {
  return timeFormat === "24h" ? "HH:mm" : "h a";
}

export function kitScrollByDay(view: TimelineKitView): boolean {
  return view === "day";
}

/**
 * Calendar-kit starts a 3-day window at `selectedDate`. Solace (and web) show
 * yesterday through tomorrow centered on that date.
 */
export function toKitPageDate(
  view: TimelineKitView,
  selectedDate: Date,
): Date {
  if (view === "3day") {
    return getThreeDayCalendarDays(selectedDate)[0];
  }

  return selectedDate;
}

export function fromKitPageDate(view: TimelineKitView, kitDate: Date): Date {
  if (view === "3day") {
    return addDays(kitDate, 1);
  }

  return kitDate;
}

export function toKitInitialDate(date: Date): string {
  return formatCalendarDayKey(date);
}

export function parseKitVisibleDate(value: string, timezone: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  return utcToPickerDate(new Date(value), resolveTimezone(timezone));
}

function shouldUseKitAllDayDate(
  event: DecoratedCalendarEvent,
  timezone: string,
): boolean {
  if (event.allDay) {
    return true;
  }

  return spansMultipleCalendarDays(
    new Date(event.start),
    new Date(event.end),
    timezone,
    { allDay: false },
  );
}

export function toKitEvent(
  event: DecoratedCalendarEvent,
  timezone: string,
  colors?: { color?: string; titleColor?: string },
): KitEventItem {
  const resolvedTimezone = resolveTimezone(timezone);

  if (shouldUseKitAllDayDate(event, resolvedTimezone)) {
    const { firstDay, lastDay } = getInclusiveCalendarDayRange(
      new Date(event.start),
      new Date(event.end),
      resolvedTimezone,
      { allDay: Boolean(event.allDay) },
    );

    return {
      id: event.id,
      title: event.title,
      color: colors?.color,
      titleColor: colors?.titleColor,
      editable: canCurrentUserModifyEvent(event),
      encryptionState: event.encryptionState,
      start: { date: formatCalendarDayKey(firstDay) },
      end: { date: formatCalendarDayKey(lastDay) },
    };
  }

  return {
    id: event.id,
    title: event.title,
    color: colors?.color,
    titleColor: colors?.titleColor,
    editable: canCurrentUserModifyEvent(event),
    encryptionState: event.encryptionState,
    start: {
      dateTime: new Date(event.start).toISOString(),
      timeZone: resolvedTimezone,
    },
    end: {
      dateTime: new Date(event.end).toISOString(),
      timeZone: resolvedTimezone,
    },
  };
}

export function kitDropToEventMove(
  dropped: KitDroppedEvent,
  original?: KitDropOriginal,
): KitEventMove | null {
  if (dropped.editable === false) {
    return null;
  }

  if (original && !canCurrentUserModifyEvent(original)) {
    return null;
  }

  const start = kitDateTime(dropped.start);
  const droppedEnd = kitDateTime(dropped.end);

  if (!start || !droppedEnd) {
    return null;
  }

  const end =
    original?.start != null && original.end != null
      ? (preserveDroppedEventDuration(start, original.start, original.end) ??
        droppedEnd)
      : droppedEnd;

  if (
    original?.start != null &&
    original.end != null &&
    toIsoInstant(original.start) === start &&
    toIsoInstant(original.end) === end
  ) {
    return null;
  }

  const recurrenceEdit = original
    ? (resolveKitRecurrenceEdit(original) ?? undefined)
    : undefined;

  return {
    eventId: dropped.id,
    start,
    end,
    ...(recurrenceEdit ? { recurrenceEdit } : {}),
  };
}

export function kitDropToVisibleDate(
  dropped: KitDroppedEvent,
  timezone: string,
): Date | null {
  const start = kitDateTime(dropped.start);
  if (!start) {
    return null;
  }

  return parseKitVisibleDate(start, timezone);
}

export function kitBackgroundToCreateSlot(
  slot: KitDateOrDateTime,
  timezone: string,
): KitCreateSlot {
  const resolvedTimezone = resolveTimezone(timezone);

  if ("date" in slot && slot.date) {
    return { date: slot.date, hour: "0" };
  }

  if (!("dateTime" in slot) || !slot.dateTime) {
    return { date: formatCalendarDayKey(new Date()), hour: "0" };
  }

  const instant = new Date(slot.dateTime);
  const pickerDate = utcToPickerDate(instant, resolvedTimezone);
  const parts = getZonedDateParts(instant, resolvedTimezone);

  return {
    date: formatCalendarDayKey(pickerDate),
    hour: String(parts.hours),
  };
}
