import type { Feather } from "@expo/vector-icons";

export type CommandActionId =
  | "compose-mail"
  | "open-mail"
  | "open-settings"
  | "open-notification-settings";

export type CommandActionGroup = "Mail" | "Navigation";

export interface CommandAction {
  id: CommandActionId;
  label: string;
  group: CommandActionGroup;
  icon: keyof typeof Feather.glyphMap;
  /** Extra terms (besides the label) matched against the search query. */
  keywords: string[];
}

export function buildCommandActions(): CommandAction[] {
  return [
    {
      id: "compose-mail",
      label: "Compose email",
      group: "Mail",
      icon: "edit",
      keywords: ["new mail", "write", "send", "message"],
    },
    {
      id: "open-mail",
      label: "Go to Mail",
      group: "Navigation",
      icon: "mail",
      keywords: ["mail", "inbox", "messages", "email"],
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

const GROUP_ORDER: CommandActionGroup[] = ["Mail", "Navigation"];

/** Groups actions in their natural order for sectioned rendering. */
export function groupCommandActions(
  actions: CommandAction[],
): { group: CommandActionGroup; actions: CommandAction[] }[] {
  return GROUP_ORDER.flatMap((group) => {
    const grouped = actions.filter((action) => action.group === group);
    return grouped.length > 0 ? [{ group, actions: grouped }] : [];
  });
}
