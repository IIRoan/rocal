import type { CalendarView } from "@workspace/calendar-core";

/** Views the native app renders; month is web-only because the mini calendar covers it on mobile. */
export type NativeCalendarView = Exclude<CalendarView, "month">;

/** Maps a shared view setting (e.g. a web default of month) onto a view native can show. */
export function toNativeCalendarView(view: CalendarView): NativeCalendarView {
  return view === "month" ? "week" : view;
}
