import React, { useMemo } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CalendarView } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { CalendarDateBar } from "./CalendarDateBar";

interface CalendarBottomChromeProps {
  activeView: CalendarView;
  switcherDate: Date;
  weekStartDay?: number;
  timezone?: string | null;
  onTodayPress: () => void;
  onForwardPress: () => void;
  onBackwardPress: () => void;
}

export function CalendarBottomChrome({
  activeView,
  switcherDate,
  weekStartDay = 1,
  timezone,
  onTodayPress,
  onForwardPress,
  onBackwardPress,
}: CalendarBottomChromeProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => createStyles(theme, insets.bottom),
    [theme, insets.bottom],
  );

  return (
    <View style={styles.shell}>
      <CalendarDateBar
        activeView={activeView}
        currentDate={switcherDate}
        weekStartDay={weekStartDay}
        timezone={timezone}
        onTodayPress={onTodayPress}
        onForwardPress={onForwardPress}
        onBackwardPress={onBackwardPress}
      />
    </View>
  );
}

function createStyles(theme: ThemeTokens, bottomInset: number) {
  return StyleSheet.create({
    shell: {
      backgroundColor: theme.colors.background,
      paddingBottom: Math.max(bottomInset, theme.spacing["2"]),
    } as ViewStyle,
  });
}
