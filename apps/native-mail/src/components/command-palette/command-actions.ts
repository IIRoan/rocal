import type { Feather } from "@expo/vector-icons";
import {
  getSettingsHubItems,
  getSettingsMailItems,
  type SettingsHubId,
  type SettingsMailId,
} from "@workspace/calendar-core";
import {
  buildPasskeyCommandActions,
  buildSettingsCommandActions,
  buildThemeCommandActions,
  type CommonCommandAction,
  type CommonCommandActionGroup,
  type CommonCommandActionId,
} from "@workspace/native-core/lib/command-palette-common";
import {
  SETTINGS_HUB_ICONS,
  SETTINGS_MAIL_ICONS,
} from "@workspace/native-core/lib/settings-nav-icons";

export type CommandActionId =
  | "compose-mail"
  | "open-mail"
  | "open-settings"
  | CommonCommandActionId;

export type CommandActionGroup = "Mail" | "Navigation" | CommonCommandActionGroup;

export interface CommandAction extends Omit<CommonCommandAction, "id" | "group"> {
  id: CommandActionId;
  group: CommandActionGroup;
  icon: keyof typeof Feather.glyphMap;
}

/** Calendar settings belong to Solace Calendar. */
const MAIL_HIDDEN_SETTINGS: readonly SettingsHubId[] = ["calendar"];
/** Mailbox management only exists as a drawer page, so there is no settings route to jump to. */
const MAIL_UNROUTABLE_SETTINGS: readonly SettingsMailId[] = ["mailboxes"];

export function buildCommandActions(): CommandAction[] {
  return [
    {
      id: "compose-mail",
      label: "Compose email",
      group: "Mail",
      icon: "edit",
      keywords: ["new mail", "write", "send", "message"],
    },
    ...buildThemeCommandActions(),
    ...buildPasskeyCommandActions(),
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
    ...buildSettingsCommandActions(
      getSettingsHubItems("native").filter(
        (item) => !MAIL_HIDDEN_SETTINGS.includes(item.id),
      ),
      SETTINGS_HUB_ICONS,
    ),
    ...buildSettingsCommandActions(
      getSettingsMailItems("native").filter(
        (item) => !MAIL_UNROUTABLE_SETTINGS.includes(item.id),
      ),
      SETTINGS_MAIL_ICONS,
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
  "Mail",
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
