import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ThemeTokens } from "@workspace/design-tokens";
import { AppScreen, StackScreenHeader } from "../../src/components/layout";
import {
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
import { useTheme, type ThemePreference } from "../../src/providers/ThemeProvider";
import {
  THEME_OPTIONS,
  VIEW_OPTIONS,
} from "../../src/lib/settings-options";

type PickerKey = "theme" | "defaultView";

export default function AppearanceSettingsScreen() {
  const { theme, themePreference, setThemePreference } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { settings, isLoading, pendingKeys, updateSetting } =
    useNativeUserSettings();
  const [activePicker, setActivePicker] = useState<PickerKey | null>(null);

  const themeLabel =
    THEME_OPTIONS.find((option) => option.value === themePreference)?.label ??
    "System";
  const viewLabel =
    VIEW_OPTIONS.find((option) => option.value === (settings?.defaultView ?? "month"))
      ?.label ?? "Month View";

  const handleThemeChange = useCallback(
    (pref: ThemePreference) => {
      setThemePreference(pref);
      updateSetting({ theme: pref });
    },
    [setThemePreference, updateSetting],
  );

  if (isLoading && !settings) {
    return <LoadingScreen theme={theme} message="Loading settings…" />;
  }

  return (
    <AppScreen header={<StackScreenHeader title="Appearance" />}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionItems}>
          <SettingsPickerRow
            icon="sun"
            label="Theme"
            value={themeLabel}
            onPress={() => setActivePicker("theme")}
            theme={theme}
            isPending={pendingKeys.has("theme")}
          />
          <SettingsPickerRow
            icon="grid"
            label="Default View"
            value={viewLabel}
            onPress={() => setActivePicker("defaultView")}
            theme={theme}
            isPending={pendingKeys.has("defaultView")}
          />
        </View>
      </ScrollView>

      <BottomSheet
        visible={activePicker !== null}
        onDismiss={() => setActivePicker(null)}
        snapPoints={[0.46]}
      >
        <BottomSheetHeader>
          <BottomSheetTitle>
            {activePicker === "theme" ? "Theme" : "Default view"}
          </BottomSheetTitle>
        </BottomSheetHeader>
        <BottomSheetScrollView
          contentContainerStyle={{
            paddingVertical: 8,
            paddingBottom: insets.bottom + 8,
          }}
        >
          {activePicker === "theme"
            ? THEME_OPTIONS.map((option) => (
                <SettingsSheetOption
                  key={option.value}
                  icon={option.icon}
                  label={option.label}
                  isSelected={themePreference === option.value}
                  onPress={() => {
                    handleThemeChange(option.value);
                    setActivePicker(null);
                  }}
                  theme={theme}
                />
              ))
            : VIEW_OPTIONS.map((option) => (
                <SettingsSheetOption
                  key={option.value}
                  icon={option.icon}
                  label={option.label}
                  isSelected={(settings?.defaultView ?? "month") === option.value}
                  onPress={() => {
                    updateSetting({ defaultView: option.value });
                    setActivePicker(null);
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
