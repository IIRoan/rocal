import type { CalendarView } from "@workspace/calendar-core";
import {
  CALENDAR_HOME_ROUTE,
  SETTINGS_ROUTE,
} from "../lib/navigation-routes";
import type { NativeCalendarView } from "../lib/calendar-views";

export type SidebarIconName =
  | "calendar"
  | "search"
  | "settings"
  | "plus"
  | "globe";

export interface SidebarMenuItem {
  key: string;
  label: string;
  icon: SidebarIconName;
  route: string;
}

const SIDEBAR_PRIMARY_MENU_ITEMS: SidebarMenuItem[] = [
  {
    key: "calendar",
    label: "Calendar",
    icon: "calendar",
    route: CALENDAR_HOME_ROUTE,
  },
  {
    key: "settings",
    label: "Settings",
    icon: "settings",
    route: SETTINGS_ROUTE,
  },
];

export function getSidebarPrimaryMenuItems(): SidebarMenuItem[] {
  return SIDEBAR_PRIMARY_MENU_ITEMS;
}

// ─── View switcher ─────────────────────────────────────────────────────────────

export interface SidebarViewOption {
  view: NativeCalendarView;
  label: string;
}

export const SIDEBAR_VIEW_OPTIONS: SidebarViewOption[] = [
  { view: "day", label: "Day" },
  { view: "3day", label: "3 Day" },
  { view: "week", label: "Week" },
];

export function getViewLabel(view: CalendarView): string {
  return SIDEBAR_VIEW_OPTIONS.find((o) => o.view === view)?.label ?? "Day";
}

export const SIDEBAR_DROPDOWN_OPTION_HEIGHT = 44;
export const SIDEBAR_DROPDOWN_TOTAL_HEIGHT =
  SIDEBAR_VIEW_OPTIONS.length * SIDEBAR_DROPDOWN_OPTION_HEIGHT;
