import type { Calendar, CalendarEvent } from "./types";
import { isAwaitingUserInvitationResponse } from "./types";

// ─── Decorated Event Type ────────────────────────────────────────────────────

/**
 * A CalendarEvent decorated with resolved display properties.
 * The color is resolved from the event's own color or its calendar's color.
 * Nullable fields are normalized to undefined for easier UI consumption.
 */
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

/**
 * Creates a Map of calendar ID → Calendar for fast lookups.
 */
export function createCalendarMap(
  calendars: Calendar[],
): Map<string, Calendar> {
  return new Map(calendars.map((calendar) => [calendar.id, calendar]));
}

/**
 * Returns a Set of calendar IDs that are currently visible.
 */
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

/**
 * Filters events to only those belonging to visible calendars,
 * then decorates each event with resolved display properties.
 */
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

/**
 * Merges preview (ghost) events into the base event list.
 * Preview events are shown in the timeline while creating via popover.
 */
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

/**
 * Ensures a preview event has a calendarId, falling back to the provided default.
 */
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

/**
 * Determines the loading state for the calendar UI based on
 * which data sources are still loading.
 */
export function resolveCalendarLoadingState(input: CalendarLoadingStateInput) {
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
