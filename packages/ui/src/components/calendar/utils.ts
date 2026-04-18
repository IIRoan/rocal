import {
  isSameDay,
  startOfDay,
  endOfDay,
  isWithinInterval,
  isBefore,
  isAfter,
} from "date-fns";

import type {
  CalendarEvent,
  EventColor,
} from "./types";

const NAMED_EVENT_COLOR_TOKENS: Record<string, string> = {
  blue: "sky",
  sky: "sky",
  violet: "violet",
  rose: "rose",
  emerald: "emerald",
  orange: "orange",
  red: "red",
  cyan: "cyan",
  lime: "lime",
  amber: "amber",
  indigo: "indigo",
  pink: "pink",
  teal: "teal",
  default: "default",
};

/**
 * Check if a string is a valid hex color
 */
function isHexColor(color: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

function normalizeNamedEventColorToken(color?: EventColor | string): string {
  if (!color) {
    return "default";
  }

  return NAMED_EVENT_COLOR_TOKENS[color] || "default";
}

export function resolveInlineColorValue(color?: EventColor | string): string {
  if (!color) {
    return "var(--event-default)";
  }

  if (isHexColor(color)) {
    return color;
  }

  return `var(--event-${normalizeNamedEventColorToken(color)})`;
}

/**
 * Get CSS classes for event colors
 */
export function getEventColorClasses(color?: EventColor | string): string {
  const eventColor = color || "sky";
  const colorToken = normalizeNamedEventColorToken(eventColor);

  // Handle hex colors - use CSS-based theme adaptation
  if (isHexColor(eventColor)) {
    return "event-hex-adaptive shadow-sm";
  }

  // Handle predefined colors
  switch (colorToken) {
    case "sky":
      return "bg-event-sky hover:bg-event-sky/80 text-event-sky-foreground shadow-sm";
    case "violet":
      return "bg-event-violet hover:bg-event-violet/80 text-event-violet-foreground shadow-sm";
    case "rose":
      return "bg-event-rose hover:bg-event-rose/80 text-event-rose-foreground shadow-sm";
    case "emerald":
      return "bg-event-emerald hover:bg-event-emerald/80 text-event-emerald-foreground shadow-sm";
    case "orange":
      return "bg-event-orange hover:bg-event-orange/80 text-event-orange-foreground shadow-sm";
    case "red":
      return "bg-event-red hover:bg-event-red/80 text-event-red-foreground shadow-sm";
    case "cyan":
      return "bg-event-cyan hover:bg-event-cyan/80 text-event-cyan-foreground shadow-sm";
    case "lime":
      return "bg-event-lime hover:bg-event-lime/80 text-event-lime-foreground shadow-sm";
    case "amber":
      return "bg-event-amber hover:bg-event-amber/80 text-event-amber-foreground shadow-sm";
    case "indigo":
      return "bg-event-indigo hover:bg-event-indigo/80 text-event-indigo-foreground shadow-sm";
    case "pink":
      return "bg-event-pink hover:bg-event-pink/80 text-event-pink-foreground shadow-sm";
    case "teal":
      return "bg-event-teal hover:bg-event-teal/80 text-event-teal-foreground shadow-sm";
    default:
      return "bg-event-default hover:bg-event-default/80 text-event-default-foreground shadow-sm";
  }
}

/**
 * Get inline styles for hex colors.
 * Sets a CSS custom property that the `.event-hex-adaptive` class uses
 * to derive theme-appropriate background and text colors via color-mix().
 */
export function getEventColorStyles(
  color?: EventColor | string,
): React.CSSProperties {
  const eventColor = color || "sky";

  if (isHexColor(eventColor)) {
    return {
      "--event-hex-color": eventColor,
    } as React.CSSProperties;
  }

  return {};
}

/**
 * Resolve an event color value to a CSS color string for indicator dots.
 */
export function resolveEventColorValue(color?: EventColor | string): string {
  return resolveInlineColorValue(color);
}

/**
 * Resolve a color name to a CSS variable reference for swatches/previews.
 * Returns the raw hex for hex colors, or a var() reference for named colors.
 */
export function getColorSwatchValue(color: string): string {
  return resolveInlineColorValue(color);
}

/**
 * Check if a color is a hex color (exported for use in other components)
 */
export { isHexColor };

/**
 * Get CSS classes for border radius based on event position in multi-day events
 */
export function getBorderRadiusClasses(
  isFirstDay: boolean,
  isLastDay: boolean,
): string {
  if (isFirstDay && isLastDay) {
    return "rounded"; // Both ends rounded
  } else if (isFirstDay) {
    return "rounded-l rounded-r-none not-in-data-[slot=popover-content]:w-[calc(100%+5px)]"; // Only left end rounded
  } else if (isLastDay) {
    return "rounded-r rounded-l-none not-in-data-[slot=popover-content]:w-[calc(100%+4px)] not-in-data-[slot=popover-content]:-translate-x-[4px]"; // Only right end rounded
  } else {
    return "rounded-none not-in-data-[slot=popover-content]:w-[calc(100%+9px)] not-in-data-[slot=popover-content]:-translate-x-[4px]"; // No rounded corners
  }
}

/**
 * Check if an event is a multi-day event
 */
export function isMultiDayEvent(event: CalendarEvent): boolean {
  const eventStart = startOfDay(new Date(event.start));
  const eventEnd = startOfDay(new Date(event.end));
  return event.allDay || !isSameDay(eventStart, eventEnd);
}

/**
 * Normalize an event's interval for overlap checks.
 * - For day-level granularity: compare on day boundaries and treat end as endOfDay
 * - For time-level granularity: use actual start/end
 */
export function getEventInterval(
  event: CalendarEvent,
  granularity: "day" | "time" = "day",
): { start: Date; end: Date } {
  const rawStart = new Date(event.start);
  const rawEnd = new Date(event.end);

  if (granularity === "time") {
    // Use precise times; guard against inverted ranges
    const start = rawStart <= rawEnd ? rawStart : rawEnd;
    const end = rawEnd >= rawStart ? rawEnd : rawStart;
    return { start, end };
  }

  // Day-level comparisons: inclusive of the final day
  const start = startOfDay(rawStart);
  const end = endOfDay(rawEnd);
  return { start, end };
}

/**
 * Check if an event overlaps a target range [start, end]
 * Uses day-level or time-level semantics.
 */
export function eventOverlapsRange(
  event: CalendarEvent,
  rangeStart: Date,
  rangeEnd: Date,
  granularity: "day" | "time" = "day",
): boolean {
  const { start, end } = getEventInterval(event, granularity);
  const rStart = granularity === "day" ? startOfDay(rangeStart) : rangeStart;
  const rEnd = granularity === "day" ? endOfDay(rangeEnd) : rangeEnd;

  return start <= rEnd && end >= rStart;
}

/**
 * Filter events for a specific day
 */
export function getEventsForDay(
  events: CalendarEvent[],
  day: Date,
): CalendarEvent[] {
  return events
    .filter((event) => {
      const eventStart = new Date(event.start);
      return isSameDay(day, eventStart);
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

/**
 * Sort events with multi-day events first, then by start time
 */
export function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    const aIsMultiDay = isMultiDayEvent(a);
    const bIsMultiDay = isMultiDayEvent(b);

    if (aIsMultiDay && !bIsMultiDay) return -1;
    if (!aIsMultiDay && bIsMultiDay) return 1;

    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });
}

/**
 * Get multi-day events that span across a specific day (but don't start on that day)
 */
export function getSpanningEventsForDay(
  events: CalendarEvent[],
  day: Date,
): CalendarEvent[] {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);

  return events.filter((event) => {
    if (!isMultiDayEvent(event)) return false;
    const { start, end } = getEventInterval(event, "day");
    // Only include if it's not the start day but overlaps the day range
    return !isSameDay(dayStart, start) && start <= dayEnd && end >= dayStart;
  });
}

/**
 * Get all events visible on a specific day (starting, ending, or spanning)
 */
export function getAllEventsForDay(
  events: CalendarEvent[],
  day: Date,
): CalendarEvent[] {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);

  return events.filter((event) =>
    eventOverlapsRange(event, dayStart, dayEnd, "day"),
  );
}

/**
 * Get all events for a day (for agenda view)
 */
export function getAgendaEventsForDay(
  events: CalendarEvent[],
  day: Date,
): CalendarEvent[] {
  return events
    .filter((event) => {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      return (
        isSameDay(day, eventStart) ||
        isSameDay(day, eventEnd) ||
        (day > eventStart && day < eventEnd)
      );
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

/**
 * Add hours to a date
 */
export function addHoursToDate(date: Date, hours: number): Date {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
}

/**
 * Add minutes to a date
 */
export function addMinutesToDate(date: Date, minutes: number): Date {
  const result = new Date(date);
  result.setMinutes(result.getMinutes() + minutes);
  return result;
}
