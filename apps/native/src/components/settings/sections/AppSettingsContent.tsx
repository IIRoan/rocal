import React, { useMemo } from "react";
import { View } from "react-native";
import {
  SettingsPage,
  SettingsScrollView,
  settingsPageStyles,
} from "../SettingsPage";
import { AppDebugSettingsSection } from "../AppDebugSettingsSection";
import { AppUpdateSettingsSection } from "../AppUpdateSettingsSection";
import { SettingsSectionLabel } from "../SettingsRows";
import { useTheme } from "../../../providers/ThemeProvider";

export function AppSettingsContent() {
  const { theme } = useTheme();
  const styles = useMemo(() => settingsPageStyles(theme), [theme]);

  return (
    <SettingsPage title="App">
      <SettingsScrollView
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
      </SettingsScrollView>
    </SettingsPage>
  );
}
