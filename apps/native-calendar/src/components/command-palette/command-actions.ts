import type { Feather } from "@expo/vector-icons";
import {
  getSettingsHubItems,
  type SettingsHubId,
} from "@workspace/calendar-core";
import {
  buildPasskeyCommandActions,
  buildSettingsCommandActions,
  buildThemeCommandActions,
  type CommonCommandAction,
  type CommonCommandActionGroup,
  type CommonCommandActionId,
} from "@workspace/native-core/lib/command-palette-common";
import { SETTINGS_HUB_ICONS } from "@workspace/native-core/lib/settings-nav-icons";
import type { NativeCalendarView } from "../../lib/calendar-views";

export type CommandActionId =
  | "new-event"
  | "go-today"
  | "view-week"
  | "view-day"
  | "view-3day"
  | "view-month"
  | "view-agenda"
  | "new-calendar"
  | "manage-calendars"
  | "open-calendar"
  | "open-settings"
  | CommonCommandActionId;

export type CommandActionGroup =
  | "Calendar"
  | "Navigation"
  | CommonCommandActionGroup;

export interface CommandAction extends Omit<CommonCommandAction, "id" | "group"> {
  id: CommandActionId;
  group: CommandActionGroup;
  icon: keyof typeof Feather.glyphMap;
  /** When set, the action switches the calendar to this view. */
  view?: NativeCalendarView;
}

/** Mail settings belong to Solace Mail. */
const CALENDAR_HIDDEN_SETTINGS: readonly SettingsHubId[] = ["mail"];

export function buildCommandActions(): CommandAction[] {
  return [
    {
      id: "new-event",
      label: "New event",
      group: "Calendar",
      icon: "plus",
      keywords: ["create", "add", "appointment", "meeting"],
    },
    {
      id: "go-today",
      label: "Go to today",
      group: "Calendar",
      icon: "calendar",
      keywords: ["now", "current", "date"],
    },
    {
      id: "view-week",
      label: "Week view",
      group: "Calendar",
      icon: "columns",
      keywords: ["week", "switch view"],
      view: "week",
    },
    {
      id: "view-day",
      label: "Day view",
      group: "Calendar",
      icon: "square",
      keywords: ["day", "switch view"],
      view: "day",
    },
    {
      id: "view-3day",
      label: "3-day view",
      group: "Calendar",
      icon: "sidebar",
      keywords: ["three day", "3 day", "switch view"],
      view: "3day",
    },
    {
      id: "view-month",
      label: "Month view",
      group: "Calendar",
      icon: "grid",
      keywords: ["month", "switch view"],
      view: "month",
    },
    {
      id: "view-agenda",
      label: "Agenda view",
      group: "Calendar",
      icon: "list",
      keywords: ["agenda", "list", "upcoming", "schedule", "switch view"],
      view: "agenda",
    },
    {
      id: "new-calendar",
      label: "New calendar",
      group: "Calendar",
      icon: "folder-plus",
      keywords: ["create calendar", "add calendar"],
    },
    {
      id: "manage-calendars",
      label: "Manage calendars",
      group: "Calendar",
      icon: "layers",
      keywords: [
        "calendars",
        "delete calendar",
        "edit calendar",
        "subscriptions",
        "ics",
      ],
    },
    ...buildThemeCommandActions(),
    ...buildPasskeyCommandActions(),
    {
      id: "open-calendar",
      label: "Go to Calendar",
      group: "Navigation",
      icon: "calendar",
      keywords: ["calendar", "events"],
    },
    {
      id: "open-settings",
      label: "Settings",
      group: "Navigation",
      icon: "settings",
      keywords: ["preferences", "account", "options"],
    },
    ...buildSettingsCommandActions(
      getSettingsHubItems("native").filter(
        (item) => !CALENDAR_HIDDEN_SETTINGS.includes(item.id),
      ),
      SETTINGS_HUB_ICONS,
    ),
  ];
}

/** Case-insensitive, order-preserving match on label and keywords; a blank query returns every action. */
export function filterCommandActions(
  actions: CommandAction[],
  query: string,
): CommandAction[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return actions;

  return actions.filter((action) => {
    if (action.label.toLowerCase().includes(normalized)) return true;
    return action.keywords.some((keyword) =>
      keyword.toLowerCase().includes(normalized),
    );
  });
}

const GROUP_ORDER: CommandActionGroup[] = [
  "Calendar",
  "Appearance",
  "Security",
  "Navigation",
  "Settings",
];

/** Groups actions in their natural order for sectioned rendering. */
export function groupCommandActions(
  actions: CommandAction[],
): { group: CommandActionGroup; actions: CommandAction[] }[] {
  return GROUP_ORDER.flatMap((group) => {
    const grouped = actions.filter((action) => action.group === group);
    return grouped.length > 0 ? [{ group, actions: grouped }] : [];
  });
}
