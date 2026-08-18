import React, { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../providers/ThemeProvider";
import { useSidebar } from "../../providers/SidebarProvider";
import type { CalendarView } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { formatViewDateHeader } from "./view-switcher-utils";

interface CalendarViewSwitcherProps {
  activeView: CalendarView;
  currentDate: Date;
  weekStartDay?: number;
  timezone?: string | null;
  onTodayPress?: () => void;
  onForwardPress?: () => void;
  onBackwardPress?: () => void;
  monthStripExpanded?: boolean;
  onToggleMonthStrip?: () => void;
}

export function CalendarViewSwitcher({
  activeView,
  currentDate,
  weekStartDay = 0,
  timezone,
  onTodayPress,
  onForwardPress,
  onBackwardPress,
  monthStripExpanded,
  onToggleMonthStrip,
}: CalendarViewSwitcherProps) {
  const { theme } = useTheme();
  const { toggle: toggleSidebar } = useSidebar();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const dateHeader = useMemo(
    () => formatViewDateHeader(activeView, currentDate, weekStartDay, timezone),
    [activeView, currentDate, weekStartDay, timezone],
  );

  return (
    <View style={styles.container}>
      <View style={styles.navRow}>
        <Pressable
          onPress={toggleSidebar}
          style={styles.menuButton}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
        >
          <Feather name="menu" size={22} color={theme.colors.foreground} />
        </Pressable>

        <Pressable
          onPress={onBackwardPress}
          style={styles.navButton}
          accessibilityRole="button"
          accessibilityLabel="Navigate backward"
        >
          <Text style={styles.navArrow}>‹</Text>
        </Pressable>

        <Pressable
          onPress={() => onToggleMonthStrip?.()}
          style={styles.dateHeaderButton}
          accessibilityRole="button"
          accessibilityLabel={
            monthStripExpanded
              ? "Collapse month calendar"
              : "Expand month calendar"
          }
        >
          <Text style={styles.dateHeader}>{dateHeader}</Text>
          <Text style={styles.chevron}>{monthStripExpanded ? "▲" : "▼"}</Text>
        </Pressable>

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
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      backgroundColor: theme.colors.background,
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
    },
    navRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
    },
    navButton: {
      paddingHorizontal: theme.spacing["2"],
      paddingVertical: theme.spacing["1"],
    },
    menuButton: {
      paddingHorizontal: theme.spacing["2"],
      paddingVertical: theme.spacing["1"],
      marginRight: theme.spacing["1"],
    },
    dateHeaderButton: {
      flex: 1,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: theme.spacing["1"],
      paddingVertical: theme.spacing["2"],
    },
    todayButton: {
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["1"],
      borderRadius: theme.borderRadius.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginLeft: theme.spacing["2"],
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    navArrow: {
      fontSize: theme.typography.fontSize["2xl"].size,
      lineHeight: theme.typography.fontSize["2xl"].lineHeight,
      color: theme.colors.foreground,
    },
    dateHeader: {
      fontSize: theme.typography.fontSize.lg.size,
      lineHeight: theme.typography.fontSize.lg.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    chevron: {
      fontSize: 10,
      color: theme.colors.mutedForeground,
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

export type { CalendarViewSwitcherProps };
