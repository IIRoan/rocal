import {
  getSettingsHubItems,
  getSettingsMailItems,
  settingsSectionPath,
  type SettingsSectionId,
} from "@workspace/calendar-core";

export interface AccountSheetRow {
  id: SettingsSectionId;
  label: string;
  description: string;
  route: string;
}

export interface AccountSheetGroup {
  title: string;
  rows: AccountSheetRow[];
}

const GROUPS: { title: string; ids: SettingsSectionId[] }[] = [
  { title: "Appearance", ids: ["appearance", "time-region"] },
  { title: "Calendar", ids: ["calendar"] },
  { title: "Mail", ids: ["mail", "mailboxes", "labels", "contacts"] },
  { title: "Notifications", ids: ["notifications"] },
  { title: "Security", ids: ["security"] },
  { title: "Account", ids: ["account", "invites", "app"] },
];

/** Grouped settings rows for the account drawer, filtered by a search query. */
export function buildAccountSheetGroups(query = ""): AccountSheetGroup[] {
  const items = new Map(
    [...getSettingsHubItems("native"), ...getSettingsMailItems("native")].map(
      (item) => [item.id as SettingsSectionId, item],
    ),
  );
  const needle = query.trim().toLowerCase();

  return GROUPS.map((group) => ({
    title: group.title,
    rows: group.ids.flatMap((id) => {
      const item = items.get(id);
      if (!item) return [];
      const matches =
        !needle ||
        item.label.toLowerCase().includes(needle) ||
        item.description.toLowerCase().includes(needle);
      if (!matches) return [];
      return [
        {
          id,
          label: item.label,
          description: item.description,
          route: settingsSectionPath(id),
        },
      ];
    }),
  })).filter((group) => group.rows.length > 0);
}
