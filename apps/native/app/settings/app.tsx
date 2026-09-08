import React, { useMemo } from "react";
import { ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import type { ThemeTokens } from "@workspace/design-tokens";
import { AppScreen } from "../../src/components/layout/AppScreen";
import { StackScreenHeader } from "../../src/components/StackScreenHeader";
import { AppDebugSettingsSection } from "../../src/components/settings/AppDebugSettingsSection";
import { AppUpdateSettingsSection } from "../../src/components/settings/AppUpdateSettingsSection";
import { SettingsSectionLabel } from "../../src/components/settings/SettingsRows";
import { useTheme } from "../../src/providers/ThemeProvider";

export default function AppSettingsScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <AppScreen header={<StackScreenHeader title="App" />}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <SettingsSectionLabel text="Updates" theme={theme} />
        <View style={styles.sectionItems}>
          <AppUpdateSettingsSection />
        </View>

        <SettingsSectionLabel text="Debugging" theme={theme} isFirst={false} />
        <View style={styles.sectionItems}>
          <AppDebugSettingsSection />
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
