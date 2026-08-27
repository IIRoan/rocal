import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ThemeTokens } from "@workspace/design-tokens";
import { AppScreen, StackScreenHeader } from "../../src/components/layout";
import {
  SettingsNavigationRow,
  SettingsPickerRow,
  SettingsSheetOption,
} from "../../src/components/settings/SettingsRows";
import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetScrollView,
  BottomSheetTitle,
} from "../../src/components/BottomSheet";
import { LoadingScreen } from "../../src/components/ui/loading";
import { useNativeUserSettings } from "../../src/hooks/use-native-user-settings";
import { SETTINGS_TIMEZONE_ROUTE } from "../../src/lib/auth-routing";
import { TIME_FORMAT_OPTIONS } from "../../src/lib/settings-options";
import { useTheme } from "../../src/providers/ThemeProvider";

export default function TimeRegionSettingsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { push } = useRouter();
  const { settings, isLoading, pendingKeys, updateSetting } =
    useNativeUserSettings();
  const [timeFormatOpen, setTimeFormatOpen] = useState(false);

  const timeFormatLabel =
    TIME_FORMAT_OPTIONS.find(
      (option) => option.value === (settings?.timeFormat ?? "12h"),
    )?.label ?? "12h";

  if (isLoading && !settings) {
    return <LoadingScreen theme={theme} message="Loading settings…" />;
  }

  return (
    <AppScreen header={<StackScreenHeader title="Time & Region" />}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionItems}>
          <SettingsPickerRow
            icon="clock"
            label="Time Format"
            value={timeFormatLabel}
            onPress={() => setTimeFormatOpen(true)}
            theme={theme}
            isPending={pendingKeys.has("timeFormat")}
          />
          <SettingsNavigationRow
            icon="globe"
            label="Timezone"
            value={
              settings?.timezone ??
              Intl.DateTimeFormat().resolvedOptions().timeZone
            }
            onPress={() => push(SETTINGS_TIMEZONE_ROUTE)}
            theme={theme}
          />
        </View>
      </ScrollView>

      <BottomSheet
        visible={timeFormatOpen}
        onDismiss={() => setTimeFormatOpen(false)}
        snapPoints={[0.4]}
      >
        <BottomSheetHeader>
          <BottomSheetTitle>Time format</BottomSheetTitle>
        </BottomSheetHeader>
        <BottomSheetScrollView
          contentContainerStyle={{
            paddingVertical: 8,
            paddingBottom: insets.bottom + 8,
          }}
        >
          {TIME_FORMAT_OPTIONS.map((option) => (
            <SettingsSheetOption
              key={option.value}
              label={option.label}
              isSelected={(settings?.timeFormat ?? "12h") === option.value}
              onPress={() => {
                updateSetting({ timeFormat: option.value });
                setTimeFormatOpen(false);
              }}
              theme={theme}
            />
          ))}
        </BottomSheetScrollView>
      </BottomSheet>
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
