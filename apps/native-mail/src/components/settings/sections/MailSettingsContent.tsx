import React, { useMemo } from "react";
import {
  getSettingsMailItems,
  settingsSectionPath,
} from "@workspace/calendar-core";
import {
  SettingsPage,
  useInSettingsSheet,
  useSettingsNavigator,
} from "@workspace/native-core/components/settings/SettingsPage";
import {
  SheetGroup,
  SheetItem,
  SheetScroll,
  SheetSection,
} from "@workspace/native-core/components/sheet/SheetSections";
import { useRecentContacts } from "@workspace/native-core/hooks/use-recent-contacts";
import { SETTINGS_MAIL_ICONS } from "@workspace/native-core/lib/settings-nav-icons";

export function MailSettingsContent() {
  const navigate = useSettingsNavigator();
  const inSheet = useInSettingsSheet();
  const { contacts } = useRecentContacts();
  // Mailbox management only exists as a drawer page, so the standalone settings stack cannot open it.
  const items = useMemo(
    () =>
      getSettingsMailItems("native").filter(
        (item) => inSheet || item.id !== "mailboxes",
      ),
    [inSheet],
  );
  const contactsCount = contacts.length;

  const summaries: Record<string, string | undefined> = {
    contacts:
      contactsCount === 0
        ? "No contacts yet"
        : contactsCount === 1
          ? "1 contact"
          : `${contactsCount} contacts`,
  };

  return (
    <SettingsPage title="Mail">
      <SheetScroll>
        <SheetSection>
          <SheetGroup>
            {items.map((item) => (
              <SheetItem
                key={item.id}
                icon={SETTINGS_MAIL_ICONS[item.id]}
                label={item.label}
                value={summaries[item.id] ?? item.description}
                chevron
                onPress={() => navigate(settingsSectionPath(item.id))}
              />
            ))}
          </SheetGroup>
        </SheetSection>
      </SheetScroll>
    </SettingsPage>
  );
}
