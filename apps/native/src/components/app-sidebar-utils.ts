import type { Calendar, CalendarView } from "@workspace/calendar-core";
import { partitionCalendarsByKind } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import {
  CALENDAR_HOME_ROUTE,
  SEARCH_ROUTE,
  SETTINGS_ROUTE,
} from "../lib/auth-routing";
import { resolveCalendarSwatchColor } from "../lib/calendar-color-utils";

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

export interface SidebarCalendarAction {
  key: "create-calendar" | "add-import" | "manage-calendars";
  icon: SidebarIconName;
  route: string;
  accessibilityLabel: string;
}

export interface SidebarCalendarRow {
  id: string;
  name: string;
  isVisible: boolean;
  swatchColor: string;
}

export interface SidebarCalendarSection {
  key: "owned" | "public" | "subscribed";
  title: string | null;
  rows: SidebarCalendarRow[];
}

const SIDEBAR_PRIMARY_MENU_ITEMS: SidebarMenuItem[] = [
  {
    key: "calendar",
    label: "Calendar",
    icon: "calendar",
    route: CALENDAR_HOME_ROUTE,
  },
  { key: "search", label: "Search", icon: "search", route: SEARCH_ROUTE },
  {
    key: "settings",
    label: "Settings",
    icon: "settings",
    route: SETTINGS_ROUTE,
  },
];

const SIDEBAR_CALENDAR_ACTIONS: SidebarCalendarAction[] = [
  {
    key: "create-calendar",
    icon: "plus",
    route: "/calendar-manage/create",
    accessibilityLabel: "Create new calendar",
  },
  {
    key: "manage-calendars",
    icon: "settings",
    route: "/calendar-manage",
    accessibilityLabel: "Manage calendars",
  },
];

export function getSidebarPrimaryMenuItems(): SidebarMenuItem[] {
  return SIDEBAR_PRIMARY_MENU_ITEMS;
}

export function getSidebarCalendarActions(): SidebarCalendarAction[] {
  return SIDEBAR_CALENDAR_ACTIONS;
}

export function buildSidebarCalendarSections(
  calendars: Calendar[],
  theme: ThemeTokens,
): SidebarCalendarSection[] {
  const { ownedCalendars, publicCalendars, subscribedCalendars } =
    partitionCalendarsByKind(calendars);

  const toRows = (entries: Calendar[]): SidebarCalendarRow[] =>
    entries.map((calendar) => ({
      id: calendar.id,
      name: calendar.name,
      isVisible: calendar.isVisible,
      swatchColor: resolveCalendarSwatchColor(calendar.color, theme),
    }));

  const sections: SidebarCalendarSection[] = [
    { key: "owned", title: null, rows: toRows(ownedCalendars) },
    { key: "public", title: "Public", rows: toRows(publicCalendars) },
    {
      key: "subscribed",
      title: "Subscribed",
      rows: toRows(subscribedCalendars),
    },
  ];

  return sections.filter((section) => section.rows.length > 0);
}

// ─── View switcher ─────────────────────────────────────────────────────────────

export interface SidebarViewOption {
  view: CalendarView;
  label: string;
  icon: "square" | "columns" | "grid" | "calendar" | "list";
}

export const SIDEBAR_VIEW_OPTIONS: SidebarViewOption[] = [
  { view: "day",    label: "Day",    icon: "square" },
  { view: "3day",   label: "3 Day",  icon: "columns" },
  { view: "week",   label: "Week",   icon: "grid" },
  { view: "month",  label: "Month",  icon: "calendar" },
  { view: "agenda", label: "Agenda", icon: "list" },
];

export function getViewLabel(view: CalendarView): string {
  return SIDEBAR_VIEW_OPTIONS.find((o) => o.view === view)?.label ?? "Day";
}

export const SIDEBAR_DROPDOWN_OPTION_HEIGHT = 44;
export const SIDEBAR_DROPDOWN_TOTAL_HEIGHT =
  SIDEBAR_VIEW_OPTIONS.length * SIDEBAR_DROPDOWN_OPTION_HEIGHT;
