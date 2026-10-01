import {
  getSettingsHubItems,
  getSettingsMailItems,
  settingsSectionPath,
} from "@workspace/calendar-core";

export interface AccountSheetRow {
  id: string;
  label: string;
  /** One-line summary of what the page holds; searched alongside the label. */
  description?: string;
  route: string;
}

export interface AccountSheetGroup {
  title: string;
  rows: AccountSheetRow[];
}

/** A single setting inside a settings page, so search can open the page that holds it. */
export interface AccountSheetSearchEntry {
  pageId: string;
  label: string;
  /** Where it lives, e.g. "Appearance · Theme". */
  location: string;
  /** Extra words that should find it, e.g. "mode" for the theme options. */
  keywords?: string;
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
  const items = new Map<string, { label: string; description?: string }>(
    [...getSettingsHubItems("native"), ...getSettingsMailItems("native")].map(
      (item) => [item.id, item],
    ),
  );

  return defs
    .map((group) => ({
      title: group.title,
      rows: group.ids.flatMap((id) => {
        const item = items.get(id);
        const label = labels[id] ?? item?.label;
        if (!label) return [];
        return [
          {
            id,
            label,
            description: item?.description,
            route: settingsSectionPath(id),
          },
        ];
      }),
    }))
    .filter((group) => group.rows.length > 0);
}

/** Keeps rows whose label or description contains every word of the query; a blank query keeps everything. */
export function filterAccountSheetGroups(
  groups: readonly AccountSheetGroup[],
  query: string,
): AccountSheetGroup[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...groups];

  return groups
    .map((group) => ({
      title: group.title,
      rows: group.rows.filter((row) => {
        const haystack = `${row.label} ${row.description ?? ""}`.toLowerCase();
        return words.every((word) => haystack.includes(word));
      }),
    }))
    .filter((group) => group.rows.length > 0);
}

/** Keeps entries whose label, location or keywords contain every word of the query. */
export function filterAccountSheetSearchEntries(
  entries: readonly AccountSheetSearchEntry[],
  query: string,
): AccountSheetSearchEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  return entries.filter((entry) => {
    const haystack =
      `${entry.label} ${entry.location} ${entry.keywords ?? ""}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
