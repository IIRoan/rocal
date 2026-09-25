import type { Feather } from "@expo/vector-icons";
import type { NativeCalendarView } from "../../lib/calendar-views";

export type CommandActionId =
  | "new-event"
  | "go-today"
  | "view-week"
  | "view-day"
  | "view-3day"
  | "open-calendar"
  | "open-settings"
  | "open-notification-settings";

export type CommandActionGroup = "Calendar" | "Navigation";

export interface CommandAction {
  id: CommandActionId;
  label: string;
  group: CommandActionGroup;
  icon: keyof typeof Feather.glyphMap;
  /** Extra terms (besides the label) matched against the search query. */
  keywords: string[];
  /** When set, the action switches the calendar to this view. */
  view?: NativeCalendarView;
}

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
    {
      id: "open-notification-settings",
      label: "Notification settings",
      group: "Navigation",
      icon: "bell",
      keywords: ["email", "push", "reminder", "alert", "iphone"],
    },
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

/** Groups actions in their natural order for sectioned rendering. */
export function groupCommandActions(
  actions: CommandAction[],
): { group: CommandActionGroup; actions: CommandAction[] }[] {
  const order: CommandActionGroup[] = ["Calendar", "Navigation"];
  return order.flatMap((group) => {
    const grouped = actions.filter((action) => action.group === group);
    return grouped.length > 0 ? [{ group, actions: grouped }] : [];
  });
}
