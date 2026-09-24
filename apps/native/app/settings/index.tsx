import React, { useMemo } from "react";
import { useRouter } from "expo-router";
import {
  formatNotificationChannelsSummary,
  getSettingsHubItems,
  settingsSectionPath,
} from "@workspace/calendar-core";
import { AppScreen, StackScreenHeader } from "../../src/components/layout";
import { BlobatarAvatar } from "../../src/components/BlobatarAvatar";
import {
  SheetGroup,
  SheetItem,
  SheetScroll,
} from "../../src/components/sheet/SheetSections";
import { LoadingScreen } from "../../src/components/ui/loading";
import { useAuth } from "../../src/providers/AuthProvider";
import { useTheme } from "../../src/providers/ThemeProvider";
import { useNativeUserSettings } from "../../src/hooks/use-native-user-settings";
import { SETTINGS_HUB_ICONS } from "../../src/lib/settings-nav-icons";
import { THEME_OPTIONS } from "../../src/lib/settings-options";

export default function SettingsScreen() {
  const { theme, themePreference } = useTheme();
  const { push } = useRouter();
  const { user } = useAuth();

  const { settings, isLoading } = useNativeUserSettings();

  const hubItems = useMemo(
    () => getSettingsHubItems("native").filter((item) => item.id !== "account"),
    [],
  );
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
      <SheetScroll>
        <SheetGroup>
          <SheetItem
            label={user?.name?.trim() || user?.email?.trim() || "Solace account"}
            detail={user?.name?.trim() ? user?.email ?? undefined : undefined}
            leading={
              <BlobatarAvatar
                email={user?.email}
                name={user?.name}
                src={user?.image}
                size={40}
              />
            }
            chevron
            onPress={() => push(settingsSectionPath("account") as never)}
            accessibilityLabel="Open account settings"
          />
        </SheetGroup>
        <SheetGroup>
          {hubItems.map((item) => (
            <SheetItem
              key={item.id}
              icon={SETTINGS_HUB_ICONS[item.id]}
              label={item.label}
              value={summaries[item.id]}
              chevron
              onPress={() => push(settingsSectionPath(item.id) as never)}
            />
          ))}
        </SheetGroup>
      </SheetScroll>
    </AppScreen>
  );
}
