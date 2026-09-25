import type { NativeCalendarView } from "../lib/calendar-views";

export interface SidebarViewOption {
  view: NativeCalendarView;
  label: string;
}

export const SIDEBAR_VIEW_OPTIONS: SidebarViewOption[] = [
  { view: "day", label: "Day" },
  { view: "3day", label: "3 Day" },
  { view: "week", label: "Week" },
];
