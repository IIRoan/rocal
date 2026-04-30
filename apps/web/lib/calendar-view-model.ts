/**
 * @deprecated Import directly from "@workspace/calendar-core" instead.
 * This file is a thin re-export for backwards compatibility.
 */
export {
  createCalendarMap,
  createVisibleCalendarIdSet,
  transformCalendarEvents,
  mergePreviewCalendarEvents,
  normalizePreviewEventCalendarId,
  resolveCalendarLoadingState,
  parseWorkingDays,
  getDefaultCalendarDateRange,
} from "@workspace/calendar-core";
export type { CalendarOverlayContext } from "@workspace/calendar-core";
