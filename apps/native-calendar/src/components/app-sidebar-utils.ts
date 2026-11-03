import { VIEW_OPTIONS } from "../lib/calendar-view-options";
import type { NativeCalendarView } from "../lib/calendar-views";

const SIDEBAR_VIEW_ORDER: readonly NativeCalendarView[] = [
  "day",
  "3day",
  "week",
  "month",
  "agenda",
];

export const SIDEBAR_VIEW_OPTIONS = [...VIEW_OPTIONS].sort(
  (a, b) =>
    SIDEBAR_VIEW_ORDER.indexOf(a.value) - SIDEBAR_VIEW_ORDER.indexOf(b.value),
);
