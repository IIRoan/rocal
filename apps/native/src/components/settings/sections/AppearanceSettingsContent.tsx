import React, { useCallback } from "react";
import { SettingsPage } from "../SettingsPage";
import {
  SheetCenteredState,
  SheetGroup,
  SheetItem,
  SheetScroll,
  SheetSection,
} from "../../sheet/SheetSections";
import { useNativeUserSettings } from "../../../hooks/use-native-user-settings";
import { useTheme, type ThemePreference } from "../../../providers/ThemeProvider";
import { toNativeCalendarView } from "../../../lib/calendar-views";
import { THEME_OPTIONS, VIEW_OPTIONS } from "../../../lib/settings-options";

export function AppearanceSettingsContent() {
  const { themePreference, setThemePreference } = useTheme();
  const { settings, isLoading, pendingKeys, updateSetting } =
    useNativeUserSettings();

  const defaultView = toNativeCalendarView(settings?.defaultView ?? "month");
  const themePending = pendingKeys.has("theme");
  const viewPending = pendingKeys.has("defaultView");

  const handleThemeChange = useCallback(
    (pref: ThemePreference) => {
      setThemePreference(pref);
      updateSetting({ theme: pref });
    },
    [setThemePreference, updateSetting],
  );

  if (isLoading && !settings) {
    return (
      <SettingsPage title="Appearance">
        <SheetCenteredState loading message="Loading settings…" />
      </SettingsPage>
    );
  }

  return (
    <SettingsPage title="Appearance">
      <SheetScroll>
        <SheetSection title="Theme">
          <SheetGroup>
            {THEME_OPTIONS.map((option) => {
              const selected = themePreference === option.value;
              return (
                <SheetItem
                  key={option.value}
                  icon={option.icon}
                  label={option.label}
                  checked={selected}
                  pending={selected && themePending}
                  onPress={() => handleThemeChange(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                />
              );
            })}
          </SheetGroup>
        </SheetSection>

        <SheetSection title="Default view">
          <SheetGroup>
            {VIEW_OPTIONS.map((option) => {
              const selected = defaultView === option.value;
              return (
                <SheetItem
                  key={option.value}
                  icon={option.icon}
                  label={option.label}
                  checked={selected}
                  pending={selected && viewPending}
                  onPress={() => updateSetting({ defaultView: option.value })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                />
              );
            })}
          </SheetGroup>
        </SheetSection>
      </SheetScroll>
    </SettingsPage>
  );
}
