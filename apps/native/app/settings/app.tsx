import React, { useMemo } from "react";
import { ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import type { ThemeTokens } from "@workspace/design-tokens";
import { AppScreen, StackScreenHeader } from "../../src/components/layout";
import { AppUpdateSettingsSection } from "../../src/components/settings/AppUpdateSettingsSection";
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
        <View style={styles.sectionItems}>
          <AppUpdateSettingsSection />
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
