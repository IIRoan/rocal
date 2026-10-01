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
import {
  SETTINGS_HUB_ICONS,
  SETTINGS_MAIL_ICONS,
} from "@workspace/native-core/lib/settings-nav-icons";
import { SHARED_SETTINGS_SEARCH_ENTRIES } from "@workspace/native-core/lib/settings-search-entries";
import { MAIL_SETTINGS_SEARCH_ENTRIES } from "../lib/settings-search-entries";
import { ComposeSettingsContent } from "./settings/sections/ComposeSettingsContent";
import { ContactsSettingsContent } from "./settings/sections/ContactsSettingsContent";
import { LabelsSettingsContent } from "./settings/sections/LabelsSettingsContent";
import { MailDisplaySettingsContent } from "./settings/sections/MailDisplaySettingsContent";
import { MailListSettingsContent } from "./settings/sections/MailListSettingsContent";
import { MailSettingsContent } from "./settings/sections/MailSettingsContent";
import { MailboxesSettingsContent } from "./settings/sections/MailboxesSettingsContent";

const MAIL_ACCOUNT_SHEET_CONFIG: AccountSheetConfig = {
  groups: buildAccountSheetGroups(
    accountSheetGroupDefs({
      title: "Mail",
      ids: ["mail", "mailboxes", "labels", "contacts"],
    }),
  ),
  searchEntries: [
    ...SHARED_SETTINGS_SEARCH_ENTRIES,
    ...MAIL_SETTINGS_SEARCH_ENTRIES,
  ],
  pages: {
    ...SHARED_SETTINGS_SHEET_PAGES,
    composing: ComposeSettingsContent,
    contacts: ContactsSettingsContent,
    labels: LabelsSettingsContent,
    mail: MailSettingsContent,
    "mail-display": MailDisplaySettingsContent,
    "mail-list": MailListSettingsContent,
    mailboxes: MailboxesSettingsContent,
  },
  icons: { ...SETTINGS_HUB_ICONS, ...SETTINGS_MAIL_ICONS },
};

export function MailAccountSheet({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}) {
  return (
    <AccountSheet
      visible={visible}
      config={MAIL_ACCOUNT_SHEET_CONFIG}
      onDismiss={onDismiss}
    />
  );
}
