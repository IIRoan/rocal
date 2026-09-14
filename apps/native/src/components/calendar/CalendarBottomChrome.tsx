import React, { useMemo } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CalendarView } from "@workspace/calendar-core";
import type { DecoratedCalendarEvent } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { CompactMonthStrip } from "./CompactMonthStrip";
import { CalendarDateBar } from "./CalendarDateBar";

interface CalendarBottomChromeProps {
  activeView: CalendarView;
  currentDate: Date;
  selectedDate: Date;
  switcherDate: Date;
  weekStartDay?: number;
  timezone?: string | null;
  events: DecoratedCalendarEvent[];
  monthStripExpanded: boolean;
  showMonthStrip: boolean;
  onTodayPress: () => void;
  onForwardPress: () => void;
  onBackwardPress: () => void;
  onToggleMonthStrip?: () => void;
  onDayPress: (date: Date) => void;
  onMonthChange: (direction: 1 | -1) => void;
  onExpandAnimationEnd: (expanded: boolean) => void;
}

export function CalendarBottomChrome({
  activeView,
  currentDate,
  selectedDate,
  switcherDate,
  weekStartDay = 1,
  timezone,
  events,
  monthStripExpanded,
  showMonthStrip,
  onTodayPress,
  onForwardPress,
  onBackwardPress,
  onToggleMonthStrip,
  onDayPress,
  onMonthChange,
  onExpandAnimationEnd,
}: CalendarBottomChromeProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => createStyles(theme, insets.bottom),
    [theme, insets.bottom],
  );

  return (
    <View style={styles.shell}>
      {showMonthStrip ? (
        <CompactMonthStrip
          currentDate={currentDate}
          selectedDate={selectedDate}
          events={events}
          weekStartDay={weekStartDay}
          timezone={timezone ?? undefined}
          expanded={monthStripExpanded}
          externalExpandControl={monthStripExpanded}
          swipeEnabled
          showHandle
          onDayPress={onDayPress}
          onMonthChange={onMonthChange}
          onToggleExpand={onToggleMonthStrip ?? (() => {})}
          onExpandAnimationEnd={onExpandAnimationEnd}
        />
      ) : null}

      <CalendarDateBar
        activeView={activeView}
        currentDate={switcherDate}
        weekStartDay={weekStartDay}
        timezone={timezone}
        monthStripExpanded={monthStripExpanded}
        onTodayPress={onTodayPress}
        onForwardPress={onForwardPress}
        onBackwardPress={onBackwardPress}
        onToggleMonthStrip={showMonthStrip ? onToggleMonthStrip : undefined}
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
