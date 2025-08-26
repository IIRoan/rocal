import type { CalendarEvent, EventColor } from "@workspace/ui/components/index.ts";
/**
 * Get CSS classes for event colors
 */
export declare function getEventColorClasses(color?: EventColor | string): string;
/**
 * Get inline styles for hex colors
 */
export declare function getEventColorStyles(color?: EventColor | string): React.CSSProperties;
/**
 * Get CSS classes for border radius based on event position in multi-day events
 */
export declare function getBorderRadiusClasses(isFirstDay: boolean, isLastDay: boolean): string;
/**
 * Check if an event is a multi-day event
 */
export declare function isMultiDayEvent(event: CalendarEvent): boolean;
/**
 * Filter events for a specific day
 */
export declare function getEventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[];
/**
 * Sort events with multi-day events first, then by start time
 */
export declare function sortEvents(events: CalendarEvent[]): CalendarEvent[];
/**
 * Get multi-day events that span across a specific day (but don't start on that day)
 */
export declare function getSpanningEventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[];
/**
 * Get all events visible on a specific day (starting, ending, or spanning)
 */
export declare function getAllEventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[];
/**
 * Get all events for a day (for agenda view)
 */
export declare function getAgendaEventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[];
/**
 * Add hours to a date
 */
export declare function addHoursToDate(date: Date, hours: number): Date;
/**
 * Add minutes to a date
 */
export declare function addMinutesToDate(date: Date, minutes: number): Date;
//# sourceMappingURL=utils.d.ts.map