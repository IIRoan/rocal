import type { ComponentType } from "react";
import { getSettingsNavItem } from "@workspace/calendar-core";
import { AccountSettingsContent } from "./AccountSettingsContent";
import { AppearanceSettingsContent } from "./AppearanceSettingsContent";
import { AppSettingsContent } from "./AppSettingsContent";
import { CalendarSettingsContent } from "./CalendarSettingsContent";
import { ContactsSettingsContent } from "./ContactsSettingsContent";
import { InvitesSettingsContent } from "./InvitesSettingsContent";
import { LabelsSettingsContent } from "./LabelsSettingsContent";
import { MailSettingsContent } from "./MailSettingsContent";
import { MailboxesSettingsContent } from "./MailboxesSettingsContent";
import { NotificationsSettingsContent } from "./NotificationsSettingsContent";
import { SecuritySettingsContent } from "./SecuritySettingsContent";
import { TimeRegionSettingsContent } from "./TimeRegionSettingsContent";
import { TimezoneSettingsContent } from "./TimezoneSettingsContent";

/** Settings pages that can render inside the account drawer, keyed by section id. */
export const SETTINGS_SHEET_PAGES: Record<string, ComponentType> = {
  account: AccountSettingsContent,
  appearance: AppearanceSettingsContent,
  app: AppSettingsContent,
  calendar: CalendarSettingsContent,
  contacts: ContactsSettingsContent,
  invites: InvitesSettingsContent,
  labels: LabelsSettingsContent,
  mail: MailSettingsContent,
  mailboxes: MailboxesSettingsContent,
  notifications: NotificationsSettingsContent,
  security: SecuritySettingsContent,
  "time-region": TimeRegionSettingsContent,
  timezone: TimezoneSettingsContent,
};

export function settingsSheetPageTitle(page: string): string {
  if (page === "timezone") {
    return "Timezone";
  }
  return getSettingsNavItem(page)?.label ?? "Settings";
}
