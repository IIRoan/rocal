import React, { useMemo } from "react";
import { ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import { useRouter } from "expo-router";
import {
  getSettingsMailItems,
  settingsSectionPath,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { AppScreen, StackScreenHeader } from "../../src/components/layout";
import { SettingsNavigationRow } from "../../src/components/settings/SettingsRows";
import { useRecentContacts } from "../../src/hooks/use-recent-contacts";
import { SETTINGS_MAIL_ICONS } from "../../src/lib/settings-nav-icons";
import { useTheme } from "../../src/providers/ThemeProvider";

export default function MailSettingsScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { push } = useRouter();
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
    <AppScreen header={<StackScreenHeader title="Mail" />}>
      <ScrollView
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
              onPress={() => push(settingsSectionPath(item.id) as never)}
              theme={theme}
            />
          ))}
        </View>
      </ScrollView>
    </AppScreen>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    scrollView: { flex: 1 },
    scrollContent: { paddingBottom: theme.spacing["8"] },
    sectionItems: { paddingVertical: theme.spacing["1"] },
  } satisfies Record<string, ViewStyle>);
}
