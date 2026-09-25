import type { ComponentType } from "react";
import { getSettingsNavItem } from "@workspace/calendar-core";
import { AccountSettingsContent } from "./AccountSettingsContent";
import { AppearanceSettingsContent } from "./AppearanceSettingsContent";
import { AppSettingsContent } from "./AppSettingsContent";
import { InvitesSettingsContent } from "./InvitesSettingsContent";
import { NotificationsSettingsContent } from "./NotificationsSettingsContent";
import { SecuritySettingsContent } from "./SecuritySettingsContent";
import { TimeRegionSettingsContent } from "./TimeRegionSettingsContent";
import { TimezoneSettingsContent } from "./TimezoneSettingsContent";

/** Account-level settings pages both apps render inside the account drawer, keyed by section id. */
export const SHARED_SETTINGS_SHEET_PAGES: Record<string, ComponentType> = {
  account: AccountSettingsContent,
  appearance: AppearanceSettingsContent,
  app: AppSettingsContent,
  invites: InvitesSettingsContent,
  notifications: NotificationsSettingsContent,
  security: SecuritySettingsContent,
  "time-region": TimeRegionSettingsContent,
  timezone: TimezoneSettingsContent,
};

export function settingsSheetPageTitle(
  page: string,
  labels: Readonly<Record<string, string | undefined>> = {},
): string {
  if (page === "timezone") {
    return "Timezone";
  }
  return labels[page] ?? getSettingsNavItem(page)?.label ?? "Settings";
}
