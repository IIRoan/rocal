import React from "react";
import {
  AccountSheet,
  type AccountSheetConfig,
} from "@workspace/native-core/components/AccountSheet";
import { SHARED_SETTINGS_SHEET_PAGES } from "@workspace/native-core/components/settings/sections";
import {
  accountSheetGroupDefs,
  buildAccountSheetGroups,
} from "@workspace/native-core/lib/account-sheet-model";
import { SETTINGS_HUB_ICONS } from "@workspace/native-core/lib/settings-nav-icons";
import { CalendarsSheetContent } from "./calendars/CalendarsSheet";
import { CalendarSettingsContent } from "./settings/sections/CalendarSettingsContent";
import { CalendarAppearanceSettingsContent } from "./settings/sections/CalendarAppearanceSettingsContent";
import {
  CALENDARS_ROOT_PAGE,
  isCalendarsSheetPage,
} from "../lib/calendars-sheet-pages";

const LABELS: Readonly<Record<string, string | undefined>> = {
  [CALENDARS_ROOT_PAGE]: "Calendars",
  calendar: "Calendar settings",
};

const CALENDAR_ACCOUNT_SHEET_CONFIG: AccountSheetConfig = {
  groups: buildAccountSheetGroups(
    accountSheetGroupDefs({
      title: "Calendar",
      ids: [CALENDARS_ROOT_PAGE, "calendar"],
    }),
    LABELS,
  ),
  pages: {
    ...SHARED_SETTINGS_SHEET_PAGES,
    appearance: CalendarAppearanceSettingsContent,
    calendar: CalendarSettingsContent,
  },
  icons: {
    ...SETTINGS_HUB_ICONS,
    [CALENDARS_ROOT_PAGE]: "calendar",
    calendar: "settings",
  },
  labels: LABELS,
  customPages: {
    isPage: isCalendarsSheetPage,
    render: (pageId) => (
      <CalendarsSheetContent pageId={pageId} rootBackLabel="Back to settings" />
    ),
  },
};

export function CalendarAccountSheet({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}) {
  return (
    <AccountSheet
      visible={visible}
      config={CALENDAR_ACCOUNT_SHEET_CONFIG}
      onDismiss={onDismiss}
    />
  );
}
