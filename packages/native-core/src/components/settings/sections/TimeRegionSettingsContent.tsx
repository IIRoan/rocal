import React from "react";
import { resolveTimeFormat } from "@workspace/calendar-core";
import { SettingsPage, useSettingsNavigator } from "../SettingsPage";
import {
  SheetCenteredState,
  SheetGroup,
  SheetItem,
  SheetScroll,
  SheetSection,
} from "../../sheet/SheetSections";
import { useNativeUserSettings } from "../../../hooks/use-native-user-settings";
import { SETTINGS_TIMEZONE_ROUTE } from "../../../lib/auth-routing";
import { TIME_FORMAT_OPTIONS } from "../../../lib/settings-options";

export function TimeRegionSettingsContent() {
  const navigate = useSettingsNavigator();
  const { settings, isLoading, pendingKeys, updateSetting } =
    useNativeUserSettings();

  const timeFormat = resolveTimeFormat(settings?.timeFormat);
  const timeFormatPending = pendingKeys.has("timeFormat");

  if (isLoading && !settings) {
    return (
      <SettingsPage title="Time & Region">
        <SheetCenteredState loading message="Loading settings…" />
      </SettingsPage>
    );
  }

  return (
    <SettingsPage title="Time & Region">
      <SheetScroll>
        <SheetSection title="Time format">
          <SheetGroup>
            {TIME_FORMAT_OPTIONS.map((option) => {
              const selected = timeFormat === option.value;
              return (
                <SheetItem
                  key={option.value}
                  label={option.label}
                  checked={selected}
                  pending={selected && timeFormatPending}
                  onPress={() => updateSetting({ timeFormat: option.value })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                />
              );
            })}
          </SheetGroup>
        </SheetSection>

        <SheetSection title="Region">
          <SheetGroup>
            <SheetItem
              icon="globe"
              label="Timezone"
              value={
                settings?.timezone ??
                Intl.DateTimeFormat().resolvedOptions().timeZone
              }
              chevron
              onPress={() => navigate(SETTINGS_TIMEZONE_ROUTE)}
            />
          </SheetGroup>
        </SheetSection>
      </SheetScroll>
    </SettingsPage>
  );
}
