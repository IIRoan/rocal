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
import { ContactsSettingsContent } from "./settings/sections/ContactsSettingsContent";
import { LabelsSettingsContent } from "./settings/sections/LabelsSettingsContent";
import { MailSettingsContent } from "./settings/sections/MailSettingsContent";
import { MailboxesSettingsContent } from "./settings/sections/MailboxesSettingsContent";

const MAIL_ACCOUNT_SHEET_CONFIG: AccountSheetConfig = {
  groups: buildAccountSheetGroups(
    accountSheetGroupDefs({
      title: "Mail",
      ids: ["mail", "mailboxes", "labels", "contacts"],
    }),
  ),
  pages: {
    ...SHARED_SETTINGS_SHEET_PAGES,
    contacts: ContactsSettingsContent,
    labels: LabelsSettingsContent,
    mail: MailSettingsContent,
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
