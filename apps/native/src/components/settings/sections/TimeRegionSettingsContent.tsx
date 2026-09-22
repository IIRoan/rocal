import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  SettingsPage,
  SettingsScrollView,
  settingsPageStyles,
  useSettingsNavigator,
} from "../SettingsPage";
import {
  SettingsNavigationRow,
  SettingsPickerRow,
  SettingsSheetOption,
} from "../SettingsRows";
import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetScrollView,
  BottomSheetTitle,
} from "../../BottomSheet";
import { SheetPortal } from "../../SheetPortal";
import { CenteredLoader } from "../../ui/loading";
import { useNativeUserSettings } from "../../../hooks/use-native-user-settings";
import { SETTINGS_TIMEZONE_ROUTE } from "../../../lib/auth-routing";
import { TIME_FORMAT_OPTIONS } from "../../../lib/settings-options";
import { useTheme } from "../../../providers/ThemeProvider";

export function TimeRegionSettingsContent() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => settingsPageStyles(theme), [theme]);
  const navigate = useSettingsNavigator();
  const { settings, isLoading, pendingKeys, updateSetting } =
    useNativeUserSettings();
  const [timeFormatOpen, setTimeFormatOpen] = useState(false);

  const timeFormatLabel =
    TIME_FORMAT_OPTIONS.find(
      (option) => option.value === (settings?.timeFormat ?? "12h"),
    )?.label ?? "12h";

  if (isLoading && !settings) {
    return <CenteredLoader theme={theme} message="Loading settings…" />;
  }

  return (
    <SettingsPage title="Time & Region">
      <SettingsScrollView
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
            onPress={() => navigate(SETTINGS_TIMEZONE_ROUTE)}
            theme={theme}
          />
        </View>
      </SettingsScrollView>

      <SheetPortal>
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
      </SheetPortal>
    </SettingsPage>
  );
}
