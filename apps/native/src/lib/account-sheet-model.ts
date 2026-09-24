import {
  getSettingsHubItems,
  getSettingsMailItems,
  settingsSectionPath,
  type SettingsSectionId,
} from "@workspace/calendar-core";
import { CALENDARS_ROOT_PAGE } from "./calendars-sheet-pages";

type AccountSheetRowId = SettingsSectionId | typeof CALENDARS_ROOT_PAGE;

export interface AccountSheetRow {
  id: AccountSheetRowId;
  label: string;
  route: string;
}

export interface AccountSheetGroup {
  title: string;
  rows: AccountSheetRow[];
}

const GROUPS: { title: string; ids: AccountSheetRowId[] }[] = [
  { title: "Appearance", ids: ["appearance", "time-region"] },
  { title: "Calendar", ids: [CALENDARS_ROOT_PAGE, "calendar"] },
  { title: "Mail", ids: ["mail", "mailboxes", "labels", "contacts"] },
  { title: "Notifications", ids: ["notifications"] },
  { title: "Security", ids: ["security"] },
  { title: "Account", ids: ["account", "invites", "app"] },
];

/** Drawer labels that differ from the shared settings nav, keyed by row id. */
const ACCOUNT_SHEET_LABELS: Readonly<Record<string, string | undefined>> = {
  [CALENDARS_ROOT_PAGE]: "Calendars",
  calendar: "Calendar settings",
};

export function accountSheetLabel(id: string): string | undefined {
  return ACCOUNT_SHEET_LABELS[id];
}

export function buildAccountSheetGroups(): AccountSheetGroup[] {
  const items = new Map<string, string>(
    [...getSettingsHubItems("native"), ...getSettingsMailItems("native")].map(
      (item) => [item.id, item.label],
    ),
  );

  return GROUPS.map((group) => ({
    title: group.title,
    rows: group.ids.flatMap((id) => {
      const label = ACCOUNT_SHEET_LABELS[id] ?? items.get(id);
      if (!label) return [];
      return [{ id, label, route: settingsSectionPath(id) }];
    }),
  })).filter((group) => group.rows.length > 0);
}
