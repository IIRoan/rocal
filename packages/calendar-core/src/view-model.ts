import type { Calendar, CalendarEvent } from "./types";
import { isAwaitingUserInvitationResponse } from "./types";

// ─── Decorated Event Type ────────────────────────────────────────────────────

/** CalendarEvent with a resolved color (event or calendar) and nulls normalized to undefined. */
export interface DecoratedCalendarEvent extends Omit<
  CalendarEvent,
  "description" | "location" | "categoryId" | "reminder" | "color"
> {
  description?: string;
  color?: string;
  location?: string;
  categoryId?: string;
  reminder?: number;
  isPreview?: boolean;
}

// ─── Loading State ───────────────────────────────────────────────────────────

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

// ─── Functions ───────────────────────────────────────────────────────────────

export function createCalendarMap(
  calendars: Calendar[],
): Map<string, Calendar> {
  return new Map(calendars.map((calendar) => [calendar.id, calendar]));
}

export function createVisibleCalendarIdSet(
  calendars: Calendar[],
  isCalendarVisible: (calendarId: string) => boolean,
): Set<string> {
  return new Set(
    calendars
      .filter((calendar) => isCalendarVisible(calendar.id))
      .map((calendar) => calendar.id),
  );
}

function decorateCalendarEvent(
  event: CalendarEvent | DecoratedCalendarEvent,
  calendarMap: Map<string, Calendar>,
): DecoratedCalendarEvent {
  const calendar = calendarMap.get(event.calendarId);
  const eventColor = event.color || calendar?.color || undefined;

  return {
    ...event,
    description: event.description ?? undefined,
    color: eventColor ?? undefined,
    location: event.location ?? undefined,
    categoryId: event.categoryId ?? undefined,
    reminder: event.reminder ?? undefined,
  } as DecoratedCalendarEvent;
}

export function transformCalendarEvents(
  events: CalendarEvent[],
  calendarMap: Map<string, Calendar>,
  visibleCalendarIds: Set<string>,
): DecoratedCalendarEvent[] {
  return events
    .filter(
      (event) =>
        visibleCalendarIds.has(event.calendarId) ||
        isAwaitingUserInvitationResponse(event),
    )
    .map((event) => decorateCalendarEvent(event, calendarMap));
}

/** Merges preview (ghost) events, shown in the timeline while creating via popover. */
export function mergePreviewCalendarEvents({
  baseEvents,
  calendarMap,
  previewEvents,
}: {
  baseEvents: DecoratedCalendarEvent[];
  calendarMap: Map<string, Calendar>;
  previewEvents: Array<DecoratedCalendarEvent | null | undefined>;
}): DecoratedCalendarEvent[] {
  const activePreviewEvents = previewEvents.filter(
    (event): event is DecoratedCalendarEvent => Boolean(event),
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
    } as DecoratedCalendarEvent);
  }

  return mergedEvents;
}

export function normalizePreviewEventCalendarId(
  event: DecoratedCalendarEvent | null,
  fallbackCalendarId: string,
): DecoratedCalendarEvent | null {
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

export function resolveCalendarLoadingState(input: CalendarLoadingStateInput) {
  const isStructureLoading =
    input.settingsLoading ||
    (input.calendarsLoading && input.calendarCount === 0) ||
    (input.categoriesLoading && input.categoryCount === 0);
  // Callers must pass eventsLoading=true until the first events query has settled, including the window before that query is enabled.
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
