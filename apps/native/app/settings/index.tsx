import React, { useMemo } from "react";
import { ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  formatNotificationChannelsSummary,
  getSettingsHubItems,
  settingsSectionPath,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { AppScreen, StackScreenHeader } from "../../src/components/layout";
import {
  SettingsAccountCard,
  SettingsNavigationRow,
} from "../../src/components/settings/SettingsRows";
import { LoadingScreen } from "../../src/components/ui/loading";
import { useAuth } from "../../src/providers/AuthProvider";
import { useTheme } from "../../src/providers/ThemeProvider";
import { calendarApiService } from "../../src/lib/api";
import { QUERY_KEYS } from "../../src/lib/query-keys";
import { SETTINGS_HUB_ICONS } from "../../src/lib/settings-nav-icons";
import { THEME_OPTIONS } from "../../src/lib/settings-options";

export default function SettingsScreen() {
  const { theme, themePreference } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { push } = useRouter();
  const { user } = useAuth();

  const { data: settings, isLoading } = useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
    staleTime: 5 * 60 * 1000,
  });

  const hubItems = useMemo(() => getSettingsHubItems("native"), []);
  const themeLabel =
    THEME_OPTIONS.find((option) => option.value === themePreference)?.label ??
    "System";

  const summaries: Record<string, string | undefined> = {
    appearance: themeLabel,
    "time-region":
      settings?.timezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    notifications: formatNotificationChannelsSummary(settings),
  };

  if (isLoading && !settings) {
    return <LoadingScreen theme={theme} message="Loading settings…" />;
  }

  return (
    <AppScreen header={<StackScreenHeader title="Settings" />}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionItems}>
          <SettingsAccountCard
            name={user?.name}
            email={user?.email}
            imageUrl={user?.image}
            theme={theme}
            onPress={() => push(settingsSectionPath("account") as never)}
          />
        </View>
        <View style={styles.sectionItems}>
          {hubItems
            .filter((item) => item.id !== "account")
            .map((item) => (
              <SettingsNavigationRow
                key={item.id}
                icon={SETTINGS_HUB_ICONS[item.id]}
                label={item.label}
                value={summaries[item.id] ?? item.description}
                onPress={() => push(settingsSectionPath(item.id) as never)}
                theme={theme}
              />
            ))}
        </View>
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </AppScreen>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: theme.spacing["8"],
      paddingTop: theme.spacing["2"],
    },
    sectionItems: {
      paddingVertical: theme.spacing["1"],
    },
    bottomSpacer: {
      height: theme.spacing["8"],
    },
  } satisfies Record<string, ViewStyle>);
}
