import {
  AgendaDaysToShow,
  type CalendarEvent as UiCalendarEvent,
  type CalendarView,
} from "@workspace/ui/components/calendar";
import {
  addDays,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import type {
  Calendar as AppCalendar,
  CalendarEvent as AppCalendarEvent,
} from "./types/calendar";

type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6;

type CalendarLoadingStateInput = {
  settingsLoading: boolean;
  calendarsLoading: boolean;
  calendarCount: number;
  categoriesLoading: boolean;
  categoryCount: number;
  eventsLoading: boolean;
  eventCount: number;
};

export type CalendarOverlayContext =
  | "SETTINGS_LOAD"
  | "CALENDAR_LOAD"
  | "DATA_SYNC";

export function createCalendarMap(calendars: AppCalendar[]) {
  return new Map(calendars.map((calendar) => [calendar.id, calendar]));
}

export function createVisibleCalendarIdSet(
  calendars: AppCalendar[],
  isCalendarVisible: (calendarId: string) => boolean,
) {
  return new Set(
    calendars
      .filter((calendar) => isCalendarVisible(calendar.id))
      .map((calendar) => calendar.id),
  );
}

function decorateCalendarEvent(
  event: AppCalendarEvent | UiCalendarEvent,
  calendarMap: Map<string, AppCalendar>,
): UiCalendarEvent {
  const calendar = calendarMap.get(event.calendarId);
  const eventColor = event.color || calendar?.color || undefined;

  return {
    ...event,
    description: event.description ?? undefined,
    color: eventColor as UiCalendarEvent["color"],
    location: event.location ?? undefined,
    categoryId: event.categoryId ?? undefined,
    reminder: event.reminder ?? undefined,
  } as UiCalendarEvent;
}

export function transformCalendarEvents(
  events: AppCalendarEvent[],
  calendarMap: Map<string, AppCalendar>,
  visibleCalendarIds: Set<string>,
): UiCalendarEvent[] {
  return events
    .filter((event) => visibleCalendarIds.has(event.calendarId))
    .map((event) => decorateCalendarEvent(event, calendarMap));
}

export function mergePreviewCalendarEvents({
  baseEvents,
  calendarMap,
  previewEvents,
}: {
  baseEvents: UiCalendarEvent[];
  calendarMap: Map<string, AppCalendar>;
  previewEvents: Array<UiCalendarEvent | null | undefined>;
}): UiCalendarEvent[] {
  const activePreviewEvents = previewEvents.filter(
    (event): event is UiCalendarEvent => Boolean(event),
  );

  if (activePreviewEvents.length === 0) {
    return baseEvents;
  }

  const mergedEvents = [...baseEvents];

  for (const [index, previewEvent] of activePreviewEvents.entries()) {
    mergedEvents.push({
      ...decorateCalendarEvent(previewEvent, calendarMap),
      id: previewEvent.id || `__preview__${index > 0 ? `-${index}` : ""}`,
      isPreview: true,
    } as UiCalendarEvent);
  }

  return mergedEvents;
}

export function normalizePreviewEventCalendarId(
  event: UiCalendarEvent | null,
  fallbackCalendarId: string,
) {
  if (!event) {
    return null;
  }

  if (event.calendarId) {
    return event;
  }

  return {
    ...event,
    calendarId: fallbackCalendarId,
  };
}

export function resolveCalendarLoadingState(
  input: CalendarLoadingStateInput,
) {
  const isStructureLoading =
    input.settingsLoading ||
    (input.calendarsLoading && input.calendarCount === 0) ||
    (input.categoriesLoading && input.categoryCount === 0);
  const isInitialEventsLoading = input.eventsLoading && input.eventCount === 0;
  const isAllInitialLoading = isStructureLoading || isInitialEventsLoading;
  const overlayContext: CalendarOverlayContext | undefined =
    input.settingsLoading
      ? "SETTINGS_LOAD"
      : isStructureLoading
        ? "CALENDAR_LOAD"
        : isInitialEventsLoading
          ? "DATA_SYNC"
          : undefined;

  return {
    isStructureLoading,
    isInitialEventsLoading,
    isAllInitialLoading,
    overlayContext,
  };
}

export function parseWorkingDays(workingDays: string | null | undefined) {
  if (!workingDays) {
    return [1, 2, 3, 4, 5];
  }

  try {
    const parsedDays = JSON.parse(workingDays);

    if (
      Array.isArray(parsedDays) &&
      parsedDays.every(
        (day) => Number.isInteger(day) && day >= 0 && day <= 6,
      )
    ) {
      return parsedDays as number[];
    }
  } catch {
    // Fall through to the default work week.
  }

  return [1, 2, 3, 4, 5];
}

export function getDefaultCalendarDateRange({
  baseDate,
  view,
  weekStartDay,
}: {
  baseDate: Date;
  view: CalendarView;
  weekStartDay?: number | null;
}) {
  let start: Date;
  let end: Date;
  const weekStartsOn = (weekStartDay ?? 1) as Day;

  switch (view) {
    case "month": {
      const monthStart = startOfMonth(baseDate);
      const monthEnd = endOfMonth(monthStart);

      start = startOfWeek(monthStart, { weekStartsOn });
      end = endOfWeek(monthEnd, { weekStartsOn });
      break;
    }
    case "week":
      start = startOfWeek(baseDate, { weekStartsOn });
      end = endOfWeek(baseDate, { weekStartsOn });
      break;
    case "day":
      start = new Date(baseDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(baseDate);
      end.setHours(23, 59, 59, 999);
      break;
    case "3day":
      start = addDays(baseDate, -1);
      start.setHours(0, 0, 0, 0);
      end = addDays(baseDate, 1);
      end.setHours(23, 59, 59, 999);
      break;
    case "agenda":
      start = new Date(baseDate);
      end = addDays(baseDate, AgendaDaysToShow - 1);
      break;
    default:
      start = startOfMonth(baseDate);
      end = endOfMonth(baseDate);
      break;
  }

  return { start, end };
}