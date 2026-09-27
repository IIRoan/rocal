import type { Feather } from "@expo/vector-icons";
import type {
  SettingsNavItem,
  SettingsSectionId,
} from "@workspace/calendar-core";
import type { ThemePreference } from "../providers/ThemeProvider";

type FeatherIcon = keyof typeof Feather.glyphMap;

export type CommonCommandActionId =
  | "theme-light"
  | "theme-dark"
  | "theme-system"
  | "add-passkey"
  | "delete-passkey"
  | `settings-${SettingsSectionId}`;

export type CommonCommandActionGroup = "Appearance" | "Security" | "Settings";

export interface CommonCommandAction {
  id: CommonCommandActionId;
  label: string;
  group: CommonCommandActionGroup;
  icon: FeatherIcon;
  /** Extra terms (besides the label) matched against the search query. */
  keywords: string[];
  /** When set, the action applies this theme preference. */
  theme?: ThemePreference;
  /** When set, the action opens this settings section. */
  settingsSection?: SettingsSectionId;
}

export function buildThemeCommandActions(): CommonCommandAction[] {
  return [
    {
      id: "theme-light",
      label: "Light theme",
      group: "Appearance",
      icon: "sun",
      keywords: ["light mode", "theme", "appearance"],
      theme: "light",
    },
    {
      id: "theme-dark",
      label: "Dark theme",
      group: "Appearance",
      icon: "moon",
      keywords: ["dark mode", "theme", "appearance"],
      theme: "dark",
    },
    {
      id: "theme-system",
      label: "System theme",
      group: "Appearance",
      icon: "monitor",
      keywords: ["auto", "theme", "appearance"],
      theme: "system",
    },
  ];
}

/** Passkey deletion lives in Security settings, like the web palette's passkey list. */
export function buildPasskeyCommandActions(): CommonCommandAction[] {
  return [
    {
      id: "add-passkey",
      label: "Add passkey",
      group: "Security",
      icon: "key",
      keywords: ["new passkey", "create passkey", "security"],
    },
    {
      id: "delete-passkey",
      label: "Delete passkey",
      group: "Security",
      icon: "trash-2",
      keywords: ["remove passkey", "manage passkeys", "security"],
      settingsSection: "security",
    },
  ];
}

export function buildSettingsCommandActions<Id extends SettingsSectionId>(
  items: readonly SettingsNavItem<Id>[],
  icons: Record<Id, FeatherIcon>,
): CommonCommandAction[] {
  return items.map((item) => ({
    id: `settings-${item.id}` as const,
    label: item.label,
    group: "Settings" as const,
    icon: icons[item.id],
    keywords: ["settings", "preferences", item.description],
    settingsSection: item.id,
  }));
}
