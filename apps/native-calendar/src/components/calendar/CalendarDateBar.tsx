import React, { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import type { CalendarView } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { formatViewDateHeader } from "./view-switcher-utils";

interface CalendarDateBarProps {
  activeView: CalendarView;
  currentDate: Date;
  weekStartDay?: number;
  timezone?: string | null;
  onTodayPress?: () => void;
  onForwardPress?: () => void;
  onBackwardPress?: () => void;
}

export function CalendarDateBar({
  activeView,
  currentDate,
  weekStartDay = 0,
  timezone,
  onTodayPress,
  onForwardPress,
  onBackwardPress,
}: CalendarDateBarProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const dateHeader = useMemo(
    () => formatViewDateHeader(activeView, currentDate, weekStartDay, timezone),
    [activeView, currentDate, weekStartDay, timezone],
  );

  return (
    <View style={styles.container}>
      <Pressable
        onPress={onBackwardPress}
        style={styles.navButton}
        accessibilityRole="button"
        accessibilityLabel="Navigate backward"
      >
        <Text style={styles.navArrow}>‹</Text>
      </Pressable>

      <View style={styles.dateHeader}>
        <Text style={styles.dateHeaderText} numberOfLines={1}>
          {dateHeader}
        </Text>
      </View>

      <Pressable
        onPress={onTodayPress}
        style={styles.todayButton}
        accessibilityRole="button"
        accessibilityLabel="Go to today"
      >
        <Text style={styles.todayText}>Today</Text>
      </Pressable>

      <Pressable
        onPress={onForwardPress}
        style={styles.navButton}
        accessibilityRole="button"
        accessibilityLabel="Navigate forward"
      >
        <Text style={styles.navArrow}>›</Text>
      </Pressable>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      backgroundColor: theme.colors.background,
      paddingHorizontal: theme.spacing["2"],
      paddingVertical: theme.spacing["2"],
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    },
    navButton: {
      paddingHorizontal: theme.spacing["2"],
      paddingVertical: theme.spacing["1"],
      minWidth: 36,
      alignItems: "center" as const,
    },
    dateHeader: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      paddingVertical: theme.spacing["1"],
      minWidth: 0,
    },
    todayButton: {
      paddingHorizontal: theme.spacing["2"],
      paddingVertical: theme.spacing["1"],
      borderRadius: theme.borderRadius.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginHorizontal: theme.spacing["1"],
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    navArrow: {
      fontSize: theme.typography.fontSize["2xl"].size,
      lineHeight: theme.typography.fontSize["2xl"].lineHeight,
      color: theme.colors.foreground,
    },
    dateHeaderText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
      flexShrink: 1,
      textAlign: "center" as const,
    },
    todayText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

export type { CalendarDateBarProps };
