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

/** Theme picker; apps append their own appearance sections as children. */
export function AppearanceSettingsContent({
  children,
}: {
  children?: ReactNode;
}) {
  const { themePreference, setThemePreference } = useTheme();
  const { settings, isLoading, pendingKeys, updateSetting } =
    useNativeUserSettings();

  const themePending = pendingKeys.has("theme");

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

        {children}
      </SheetScroll>
    </SettingsPage>
  );
}
