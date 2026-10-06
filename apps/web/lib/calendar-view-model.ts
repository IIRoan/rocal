/** @deprecated Thin backwards-compat re-export; import from "@workspace/calendar-core" directly. */
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
