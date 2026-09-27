import type { CalendarView } from "@workspace/calendar-core";

export type NativeCalendarView = CalendarView;

/** Views rendered by the calendar-kit timeline; month and agenda have their own screens. */
export type TimelineCalendarView = Extract<CalendarView, "day" | "3day" | "week">;

export function isTimelineCalendarView(
  view: CalendarView,
): view is TimelineCalendarView {
  return view === "day" || view === "3day" || view === "week";
}
