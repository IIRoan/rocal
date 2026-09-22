import React, { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  SettingsPage,
  SettingsScrollView,
  settingsPageStyles,
} from "../SettingsPage";
import { SettingsPickerRow, SettingsSheetOption } from "../SettingsRows";
import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetScrollView,
  BottomSheetTitle,
} from "../../BottomSheet";
import { SheetPortal } from "../../SheetPortal";
import { CenteredLoader } from "../../ui/loading";
import { useNativeUserSettings } from "../../../hooks/use-native-user-settings";
import { useTheme, type ThemePreference } from "../../../providers/ThemeProvider";
import { THEME_OPTIONS, VIEW_OPTIONS } from "../../../lib/settings-options";

type PickerKey = "theme" | "defaultView";

export function AppearanceSettingsContent() {
  const { theme, themePreference, setThemePreference } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => settingsPageStyles(theme), [theme]);
  const { settings, isLoading, pendingKeys, updateSetting } =
    useNativeUserSettings();
  const [activePicker, setActivePicker] = useState<PickerKey | null>(null);

  const themeLabel =
    THEME_OPTIONS.find((option) => option.value === themePreference)?.label ??
    "System";
  const viewLabel =
    VIEW_OPTIONS.find(
      (option) => option.value === (settings?.defaultView ?? "month"),
    )?.label ?? "Month View";

  const handleThemeChange = useCallback(
    (pref: ThemePreference) => {
      setThemePreference(pref);
      updateSetting({ theme: pref });
    },
    [setThemePreference, updateSetting],
  );

  if (isLoading && !settings) {
    return <CenteredLoader theme={theme} message="Loading settings…" />;
  }

  return (
    <SettingsPage title="Appearance">
      <SettingsScrollView
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
      </SettingsScrollView>

      <SheetPortal>
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
                    isSelected={
                      (settings?.defaultView ?? "month") === option.value
                    }
                    onPress={() => {
                      updateSetting({ defaultView: option.value });
                      setActivePicker(null);
                    }}
                    theme={theme}
                  />
                ))}
          </BottomSheetScrollView>
        </BottomSheet>
      </SheetPortal>
    </SettingsPage>
  );
}
