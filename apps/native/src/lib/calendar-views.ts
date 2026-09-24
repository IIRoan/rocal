import type { CalendarView } from "@workspace/calendar-core";

/** Views the native app renders; month and agenda are web-only. */
export type NativeCalendarView = Extract<CalendarView, "day" | "3day" | "week">;

/** Maps a shared view setting (e.g. a web default of month or agenda) onto a view native can show. */
export function toNativeCalendarView(view: CalendarView): NativeCalendarView {
  return view === "month" || view === "agenda" ? "week" : view;
}
