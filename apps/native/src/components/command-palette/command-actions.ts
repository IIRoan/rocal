import type { Feather } from "@expo/vector-icons";
import type { CalendarView } from "@workspace/calendar-core";

export type CommandPaletteScope = "calendar" | "mail";

/** Identifiers for every quick action exposed by the command palette. */
export type CommandActionId =
  | "new-event"
  | "go-today"
  | "view-month"
  | "view-week"
  | "view-day"
  | "view-3day"
  | "view-agenda"
  | "open-calendar"
  | "open-mail"
  | "compose-mail"
  | "open-settings"
  | "open-notification-settings";

export type CommandActionGroup = "Calendar" | "Mail" | "Navigation";

export interface CommandAction {
  id: CommandActionId;
  label: string;
  group: CommandActionGroup;
  icon: keyof typeof Feather.glyphMap;
  /** Extra terms (besides the label) matched against the search query. */
  keywords: string[];
  /** When set, the action switches the calendar to this view. */
  view?: CalendarView;
}

export function buildCommandActions(
  scope: CommandPaletteScope = "calendar",
): CommandAction[] {
  return scope === "mail" ? buildMailCommandActions() : buildCalendarCommandActions();
}

function buildMailCommandActions(): CommandAction[] {
  return [
    {
      id: "compose-mail",
      label: "Compose email",
      group: "Mail",
      icon: "edit",
      keywords: ["new mail", "write", "send", "message"],
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
    {
      id: "open-calendar",
      label: "Go to Calendar",
      group: "Navigation",
      icon: "calendar",
      keywords: ["calendar", "events", "schedule"],
    },
  ];
}

function buildCalendarCommandActions(): CommandAction[] {
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
      id: "view-month",
      label: "Month view",
      group: "Calendar",
      icon: "grid",
      keywords: ["month", "switch view"],
      view: "month",
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
      id: "view-agenda",
      label: "Agenda view",
      group: "Calendar",
      icon: "list",
      keywords: ["agenda", "schedule", "list", "switch view"],
      view: "agenda",
    },
    {
      id: "open-calendar",
      label: "Go to Calendar",
      group: "Navigation",
      icon: "calendar",
      keywords: ["calendar", "events"],
    },
    {
      id: "open-mail",
      label: "Go to Mail",
      group: "Navigation",
      icon: "mail",
      keywords: ["mail", "inbox", "messages", "email"],
    },
    {
      id: "compose-mail",
      label: "Compose email",
      group: "Mail",
      icon: "edit",
      keywords: ["new mail", "write", "send", "message"],
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

/**
 * Case-insensitive, order-preserving filter over the action label and its
 * keywords. An empty/whitespace query returns every action unchanged.
 */
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
  scope: CommandPaletteScope = "calendar",
): { group: CommandActionGroup; actions: CommandAction[] }[] {
  const order: CommandActionGroup[] =
    scope === "mail"
      ? ["Mail", "Navigation"]
      : ["Calendar", "Mail", "Navigation"];
  return order.flatMap((group) => {
    const grouped = actions.filter((action) => action.group === group);
    return grouped.length > 0 ? [{ group, actions: grouped }] : [];
  });
}
