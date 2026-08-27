export type SettingsPlatform = "web" | "native";

export type SettingsHubId =
  | "account"
  | "appearance"
  | "calendar"
  | "mail"
  | "time-region"
  | "notifications"
  | "security"
  | "invites"
  | "app";

export type SettingsMailId =
  | "mailboxes"
  | "labels"
  | "contacts"
  | "composing"
  | "mail-display"
  | "mail-list";

export type SettingsSectionId = SettingsHubId | SettingsMailId;

export interface SettingsNavItem<Id extends string = SettingsSectionId> {
  id: Id;
  label: string;
  description: string;
  /** Omit to ship on both platforms. */
  platforms?: readonly SettingsPlatform[];
}

export const SETTINGS_HOME_PATH = "/settings";

export const SETTINGS_HUB_ITEMS: readonly SettingsNavItem<SettingsHubId>[] = [
  {
    id: "account",
    label: "Account",
    description: "Profile, password, and sign-out",
  },
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme and default calendar view",
  },
  {
    id: "calendar",
    label: "Calendar",
    description: "Default calendar, week start, and working days",
  },
  {
    id: "mail",
    label: "Mail",
    description: "Mailboxes, labels, contacts, and reading",
  },
  {
    id: "time-region",
    label: "Time & Region",
    description: "Timezone and time format",
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Email reminders and iPhone alerts",
  },
  {
    id: "security",
    label: "Security",
    description: "Passkeys, encryption, and on-device search",
  },
  {
    id: "invites",
    label: "Invites",
    description: "Invite friends to join Solace",
  },
  {
    id: "app",
    label: "App",
    description: "Updates and diagnostics",
    platforms: ["native"],
  },
] as const;

export const SETTINGS_MAIL_ITEMS: readonly SettingsNavItem<SettingsMailId>[] = [
  {
    id: "mailboxes",
    label: "Mailboxes",
    description: "Create, hide, and reorder folders",
  },
  {
    id: "labels",
    label: "Labels",
    description: "Manage message labels",
  },
  {
    id: "contacts",
    label: "Contacts",
    description: "People you email and receive mail from",
  },
  {
    id: "composing",
    label: "Composing",
    description: "Plain text, signatures, and attachment reminders",
    platforms: ["web"],
  },
  {
    id: "mail-display",
    label: "Content & display",
    description: "Remote images, trusted senders, and reading appearance",
    platforms: ["web"],
  },
  {
    id: "mail-list",
    label: "List & shortcuts",
    description: "Density, mark-as-read delay, undo toasts, and shortcuts",
    platforms: ["web"],
  },
] as const;

const SETTINGS_SECTION_IDS = new Set<string>([
  ...SETTINGS_HUB_ITEMS.map((item) => item.id),
  ...SETTINGS_MAIL_ITEMS.map((item) => item.id),
]);

function isAvailableOnPlatform(
  item: SettingsNavItem,
  platform: SettingsPlatform,
): boolean {
  return !item.platforms || item.platforms.includes(platform);
}

export function getSettingsHubItems(
  platform: SettingsPlatform,
): SettingsNavItem<SettingsHubId>[] {
  return SETTINGS_HUB_ITEMS.filter((item) =>
    isAvailableOnPlatform(item, platform),
  );
}

export function getSettingsMailItems(
  platform: SettingsPlatform,
): SettingsNavItem<SettingsMailId>[] {
  return SETTINGS_MAIL_ITEMS.filter((item) =>
    isAvailableOnPlatform(item, platform),
  );
}

export function isSettingsSectionId(value: string): value is SettingsSectionId {
  return SETTINGS_SECTION_IDS.has(value);
}

export function settingsSectionPath(section?: SettingsSectionId | string): string {
  if (!section) {
    return SETTINGS_HOME_PATH;
  }
  return `${SETTINGS_HOME_PATH}/${section}`;
}

export function getSettingsNavItem(
  section: string,
): SettingsNavItem | undefined {
  return (
    SETTINGS_HUB_ITEMS.find((item) => item.id === section) ??
    SETTINGS_MAIL_ITEMS.find((item) => item.id === section)
  );
}

