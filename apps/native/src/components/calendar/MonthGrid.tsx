import React, { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { isSameMonth, isSameDay, format } from "date-fns";
import { useTheme } from "../../providers/ThemeProvider";
import type { DecoratedCalendarEvent } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import {
  MAX_DOTS,
  getOrderedDayLabels,
  generateGridDates,
  groupEventsByDay,
  resolveEventDotColor,
} from "./month-grid-utils";

// ─── Props ───────────────────────────────────────────────────────────────────

interface MonthGridProps {
  /** The date representing the current month to display */
  currentDate: Date;
  /** The currently selected date (highlighted) */
  selectedDate?: Date;
  /** Events to display as dot indicators */
  events: DecoratedCalendarEvent[];
  /** Week start day: 0 = Sunday, 1 = Monday */
  weekStartDay: number;
  /** Callback when a day cell is tapped */
  onDayPress?: (date: Date) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function MonthGrid({
  currentDate,
  selectedDate,
  events,
  weekStartDay,
  onDayPress,
}: MonthGridProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const today = useMemo(() => new Date(), []);

  const dayLabels = useMemo(
    () => getOrderedDayLabels(weekStartDay),
    [weekStartDay],
  );

  const gridDates = useMemo(
    () => generateGridDates(currentDate, weekStartDay),
    [currentDate, weekStartDay],
  );

  const eventsByDay = useMemo(() => groupEventsByDay(events), [events]);

  return (
    <View style={styles.container}>
      {/* Day-of-week headers */}
      <View style={styles.headerRow}>
        {dayLabels.map((label) => (
          <View key={label} style={styles.headerCell}>
            <Text style={styles.headerText}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Day grid — 6 rows of 7 */}
      {Array.from({ length: 6 }, (_, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {gridDates.slice(rowIndex * 7, rowIndex * 7 + 7).map((date) => {
            const dateKey = format(date, "yyyy-MM-dd");
            const isCurrentMonth = isSameMonth(date, currentDate);
            const isToday = isSameDay(date, today);
            const isSelected =
              selectedDate != null &&
              !isToday &&
              isSameDay(date, selectedDate);
            const dayEvents = eventsByDay.get(dateKey) ?? [];
            const extraCount = dayEvents.length - MAX_DOTS;

            return (
              <Pressable
                key={dateKey}
                style={styles.dayCell}
                onPress={() => onDayPress?.(date)}
                accessibilityRole="button"
                accessibilityLabel={`${format(date, "MMMM d, yyyy")}${isToday ? ", today" : ""}${dayEvents.length > 0 ? `, ${dayEvents.length} event${dayEvents.length > 1 ? "s" : ""}` : ""}`}
              >
                <View
                  style={[
                    styles.dayNumberContainer,
                    isToday && styles.todayHighlight,
                    isSelected && styles.selectedHighlight,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNumber,
                      !isCurrentMonth && styles.outsideMonthText,
                      isToday && styles.todayText,
                      isSelected && styles.selectedText,
                    ]}
                  >
                    {format(date, "d")}
                  </Text>
                </View>

                {/* Event dot indicators */}
                {dayEvents.length > 0 && (
                  <View style={styles.dotsRow}>
                    {dayEvents.slice(0, MAX_DOTS).map((event, idx) => (
                      <View
                        key={event.id ?? idx}
                        style={[
                          styles.dot,
                          {
                            backgroundColor: resolveEventDotColor(
                              event.color,
                              theme,
                            ),
                          },
                        ]}
                      />
                    ))}
                    {extraCount > 0 && (
                      <Text style={styles.extraCount}>+{extraCount}</Text>
                    )}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      backgroundColor: theme.colors.background,
    },
    headerRow: {
      flexDirection: "row" as const,
      marginBottom: theme.spacing["1"],
    },
    headerCell: {
      flex: 1,
      alignItems: "center" as const,
      paddingVertical: theme.spacing["1"],
    },
    row: {
      flexDirection: "row" as const,
    },
    dayCell: {
      flex: 1,
      alignItems: "center" as const,
      paddingVertical: theme.spacing["1"],
      minHeight: 48,
    },
    dayNumberContainer: {
      width: 32,
      height: 32,
      borderRadius: theme.borderRadius.full,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    todayHighlight: {
      backgroundColor: theme.colors.primaryBase,
    },
    selectedHighlight: {
      backgroundColor: theme.colors.accent,
    },
    dotsRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      marginTop: 2,
      height: 8,
    },
    dot: {
      width: 5,
      height: 5,
      borderRadius: theme.borderRadius.full,
      marginHorizontal: 1,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    headerText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
    },
    dayNumber: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight.normal as TextStyle["fontWeight"],
      color: theme.colors.foreground,
      textAlign: "center" as const,
    },
    outsideMonthText: {
      color: theme.colors.mutedForeground,
    },
    todayText: {
      color: theme.colors.primaryForeground,
      fontWeight: theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
    },
    selectedText: {
      color: theme.colors.accentForeground,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    extraCount: {
      fontSize: 8,
      lineHeight: 8,
      color: theme.colors.mutedForeground,
      marginLeft: 1,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

export type { MonthGridProps };
