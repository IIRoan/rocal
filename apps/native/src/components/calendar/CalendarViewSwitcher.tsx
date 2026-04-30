import React, { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import {
  CALENDAR_VIEWS,
  type CalendarView,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { formatViewDateHeader, VIEW_LABELS } from "./view-switcher-utils";

// ─── Props ───────────────────────────────────────────────────────────────────

interface CalendarViewSwitcherProps {
  /** The currently active view */
  activeView: CalendarView;
  /** Callback when a view is selected */
  onViewChange: (view: CalendarView) => void;
  /** The current date being displayed (for the header title) */
  currentDate: Date;
  /** Week start day for week view header formatting (default: 0 = Sunday) */
  weekStartDay?: number;
  /** Callback to navigate to today */
  onTodayPress?: () => void;
  /** Callback to navigate forward */
  onForwardPress?: () => void;
  /** Callback to navigate backward */
  onBackwardPress?: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CalendarViewSwitcher({
  activeView,
  onViewChange,
  currentDate,
  weekStartDay = 0,
  onTodayPress,
  onForwardPress,
  onBackwardPress,
}: CalendarViewSwitcherProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const dateHeader = useMemo(
    () => formatViewDateHeader(activeView, currentDate, weekStartDay),
    [activeView, currentDate, weekStartDay],
  );

  return (
    <View style={styles.container}>
      {/* Navigation row: back, date header, today, forward */}
      <View style={styles.navRow}>
        <Pressable
          onPress={onBackwardPress}
          style={styles.navButton}
          accessibilityRole="button"
          accessibilityLabel="Navigate backward"
        >
          <Text style={styles.navArrow}>‹</Text>
        </Pressable>

        <Text style={styles.dateHeader}>{dateHeader}</Text>

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

      {/* View switcher row */}
      <View style={styles.viewRow}>
        {CALENDAR_VIEWS.map((view) => {
          const isActive = view === activeView;
          return (
            <Pressable
              key={view}
              onPress={() => onViewChange(view)}
              style={[
                styles.viewButton,
                isActive ? styles.viewButtonActive : styles.viewButtonInactive,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Switch to ${VIEW_LABELS[view]} view`}
              accessibilityState={{ selected: isActive }}
            >
              <Text
                style={[
                  styles.viewButtonText,
                  isActive
                    ? styles.viewButtonTextActive
                    : styles.viewButtonTextInactive,
                ]}
              >
                {VIEW_LABELS[view]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      backgroundColor: theme.colors.background,
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    navRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      marginBottom: theme.spacing["2"],
    },
    navButton: {
      paddingHorizontal: theme.spacing["2"],
      paddingVertical: theme.spacing["1"],
    },
    todayButton: {
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["1"],
      borderRadius: theme.borderRadius.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginLeft: theme.spacing["2"],
    },
    viewRow: {
      flexDirection: "row" as const,
      gap: theme.spacing["1"],
    },
    viewButton: {
      flex: 1,
      paddingVertical: theme.spacing["1"],
      borderRadius: theme.borderRadius.sm,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    viewButtonActive: {
      backgroundColor: theme.colors.primaryBase,
    },
    viewButtonInactive: {
      backgroundColor: theme.colors.muted,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    navArrow: {
      fontSize: theme.typography.fontSize["2xl"].size,
      lineHeight: theme.typography.fontSize["2xl"].lineHeight,
      color: theme.colors.foreground,
    },
    dateHeader: {
      flex: 1,
      fontSize: theme.typography.fontSize.lg.size,
      lineHeight: theme.typography.fontSize.lg.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
      textAlign: "center" as const,
    },
    todayText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    viewButtonText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
    },
    viewButtonTextActive: {
      color: theme.colors.primaryForeground,
    },
    viewButtonTextInactive: {
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

export type { CalendarViewSwitcherProps };
