import {
  getSettingsHubItems,
  getSettingsMailItems,
  settingsSectionPath,
} from "@workspace/calendar-core";

export interface AccountSheetRow {
  id: string;
  label: string;
  route: string;
}

export interface AccountSheetGroup {
  title: string;
  rows: AccountSheetRow[];
}

export interface AccountSheetGroupDef {
  title: string;
  ids: string[];
}

/** Shared drawer groups; each app inserts its own group after Appearance. */
export function accountSheetGroupDefs(
  appGroup: AccountSheetGroupDef,
): AccountSheetGroupDef[] {
  return [
    { title: "Appearance", ids: ["appearance", "time-region"] },
    appGroup,
    { title: "Notifications", ids: ["notifications"] },
    { title: "Security", ids: ["security"] },
    { title: "Account", ids: ["account", "invites", "app"] },
  ];
}

export function buildAccountSheetGroups(
  defs: readonly AccountSheetGroupDef[],
  labels: Readonly<Record<string, string | undefined>> = {},
): AccountSheetGroup[] {
  const items = new Map<string, string>(
    [...getSettingsHubItems("native"), ...getSettingsMailItems("native")].map(
      (item) => [item.id, item.label],
    ),
  );

  return defs
    .map((group) => ({
      title: group.title,
      rows: group.ids.flatMap((id) => {
        const label = labels[id] ?? items.get(id);
        if (!label) return [];
        return [{ id, label, route: settingsSectionPath(id) }];
      }),
    }))
    .filter((group) => group.rows.length > 0);
}
