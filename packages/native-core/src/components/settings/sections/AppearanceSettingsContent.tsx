import React, { useCallback, type ReactNode } from "react";
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
import { THEME_OPTIONS } from "../../../lib/settings-options";

/** Theme on this device; apps append synced appearance sections as children. */
export function AppearanceSettingsContent({
  children,
}: {
  children?: ReactNode;
}) {
  const { themePreference, setThemePreference } = useTheme();
  const { settings, isLoading } = useNativeUserSettings();

  const handleThemeChange = useCallback(
    (pref: ThemePreference) => {
      setThemePreference(pref);
    },
    [setThemePreference],
  );

  return (
    <SettingsPage title="Appearance">
      <SheetScroll>
        <SheetSection
          title="Theme"
          footer="Applies on this device only. Timezone and calendar prefs sync with your account."
        >
          <SheetGroup>
            {THEME_OPTIONS.map((option) => {
              const selected = themePreference === option.value;
              return (
                <SheetItem
                  key={option.value}
                  icon={option.icon}
                  label={option.label}
                  checked={selected}
                  onPress={() => handleThemeChange(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                />
              );
            })}
          </SheetGroup>
        </SheetSection>

        {children ? (
          isLoading && !settings ? (
            <SheetCenteredState loading message="Loading settings…" />
          ) : (
            children
          )
        ) : null}
      </SheetScroll>
    </SettingsPage>
  );
}
