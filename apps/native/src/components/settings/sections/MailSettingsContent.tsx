import React, { useMemo } from "react";
import { View } from "react-native";
import {
  getSettingsMailItems,
  settingsSectionPath,
} from "@workspace/calendar-core";
import {
  SettingsPage,
  SettingsScrollView,
  settingsPageStyles,
  useSettingsNavigator,
} from "../SettingsPage";
import { SettingsNavigationRow } from "../SettingsRows";
import { useRecentContacts } from "../../../hooks/use-recent-contacts";
import { SETTINGS_MAIL_ICONS } from "../../../lib/settings-nav-icons";
import { useTheme } from "../../../providers/ThemeProvider";

export function MailSettingsContent() {
  const { theme } = useTheme();
  const styles = useMemo(() => settingsPageStyles(theme), [theme]);
  const navigate = useSettingsNavigator();
  const { contacts } = useRecentContacts();
  const items = useMemo(() => getSettingsMailItems("native"), []);
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
      <SettingsScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionItems}>
          {items.map((item) => (
            <SettingsNavigationRow
              key={item.id}
              icon={SETTINGS_MAIL_ICONS[item.id]}
              label={item.label}
              value={summaries[item.id] ?? item.description}
              onPress={() => navigate(settingsSectionPath(item.id))}
              theme={theme}
            />
          ))}
        </View>
      </SettingsScrollView>
    </SettingsPage>
  );
}
