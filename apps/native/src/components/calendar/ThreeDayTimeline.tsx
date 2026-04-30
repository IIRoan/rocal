import React, { useMemo } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { isSameDay } from "date-fns";
import { useTheme } from "../../providers/ThemeProvider";
import type { DecoratedCalendarEvent } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import {
  HOUR_HEIGHT,
  TIME_GUTTER_WIDTH,
  TOTAL_HOURS,
  getThreeDayDates,
  calculateEventPosition,
  formatHourLabel,
  resolveEventBlockColor,
  groupEventsByDate,
  getEventsForDate,
  formatDayHeader,
} from "./timeline-utils";

// ─── Props ───────────────────────────────────────────────────────────────────

interface ThreeDayTimelineProps {
  /** The center date of the 3-day range */
  currentDate: Date;
  /** Events to display as positioned blocks */
  events: DecoratedCalendarEvent[];
  /** Time format: "12h" or "24h" */
  timeFormat?: "12h" | "24h";
  /** Callback when an event block is tapped */
  onEventPress?: (event: DecoratedCalendarEvent) => void;
  /** Callback when an empty time slot is tapped */
  onTimeSlotPress?: (date: Date, hour: number) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ThreeDayTimeline({
  currentDate,
  events,
  timeFormat = "12h",
  onEventPress,
  onTimeSlotPress,
}: ThreeDayTimelineProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const today = useMemo(() => new Date(), []);

  const threeDayDates = useMemo(
    () => getThreeDayDates(currentDate),
    [currentDate],
  );

  const eventsByDate = useMemo(() => groupEventsByDate(events), [events]);

  const hourLabels = useMemo(
    () =>
      Array.from({ length: TOTAL_HOURS }, (_, i) =>
        formatHourLabel(i, timeFormat),
      ),
    [timeFormat],
  );

  // Current time indicator position
  const nowMinutes = today.getHours() * 60 + today.getMinutes();
  const nowTop = (nowMinutes / 60) * HOUR_HEIGHT;

  return (
    <View style={styles.container}>
      {/* Scrollable time grid */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.gridContainer}>
          {/* Time gutter */}
          <View style={styles.timeGutter}>
            {hourLabels.map((label, hour) => (
              <View key={hour} style={styles.hourLabelContainer}>
                <Text style={styles.hourLabel}>{label}</Text>
              </View>
            ))}
          </View>

          {/* Day columns */}
          <View style={styles.columnsContainer}>
            {threeDayDates.map((date, colIdx) => {
              const dayEvents = getEventsForDate(date, eventsByDate);
              const isCurrentDay = isSameDay(date, today);

              return (
                <View key={colIdx} style={styles.dayColumn}>
                  {/* Hour row dividers and pressable slots */}
                  {Array.from({ length: TOTAL_HOURS }, (_, hour) => (
                    <Pressable
                      key={hour}
                      style={styles.hourSlot}
                      onPress={() => onTimeSlotPress?.(date, hour)}
                      accessibilityRole="button"
                      accessibilityLabel={`${formatDayHeader(date)} ${formatHourLabel(hour, timeFormat)}`}
                    >
                      <View style={styles.hourDivider} />
                    </Pressable>
                  ))}

                  {/* Positioned event blocks */}
                  {dayEvents.map((event) => {
                    const pos = calculateEventPosition(event, HOUR_HEIGHT);
                    const colors = resolveEventBlockColor(event.color, theme);

                    return (
                      <Pressable
                        key={event.id}
                        style={[
                          styles.eventBlock,
                          {
                            top: pos.top,
                            height: pos.height,
                            backgroundColor: colors.bg,
                          },
                        ]}
                        onPress={() => onEventPress?.(event)}
                        accessibilityRole="button"
                        accessibilityLabel={`${event.title}, ${formatDayHeader(date)}`}
                      >
                        <Text
                          style={[styles.eventTitle, { color: colors.fg }]}
                          numberOfLines={1}
                        >
                          {event.title}
                        </Text>
                        {pos.height >= HOUR_HEIGHT / 2 && (
                          <Text
                            style={[styles.eventTime, { color: colors.fg }]}
                            numberOfLines={1}
                          >
                            {formatHourLabel(
                              new Date(event.start).getHours(),
                              timeFormat,
                            )}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}

                  {/* Current time indicator */}
                  {isCurrentDay && (
                    <View
                      style={[styles.nowIndicator, { top: nowTop }]}
                      pointerEvents="none"
                    />
                  )}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      minHeight: TOTAL_HOURS * HOUR_HEIGHT,
    },
    gridContainer: {
      flexDirection: "row" as const,
      flex: 1,
    },
    timeGutter: {
      width: TIME_GUTTER_WIDTH,
    },
    hourLabelContainer: {
      height: HOUR_HEIGHT,
      justifyContent: "flex-start" as const,
      paddingTop: 2,
      paddingRight: theme.spacing["1"],
      alignItems: "flex-end" as const,
    },
    columnsContainer: {
      flex: 1,
      flexDirection: "row" as const,
    },
    dayColumn: {
      flex: 1,
      position: "relative" as const,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: theme.colors.border,
    },
    hourSlot: {
      height: HOUR_HEIGHT,
    },
    hourDivider: {
      position: "absolute" as const,
      top: 0,
      left: 0,
      right: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
    },
    eventBlock: {
      position: "absolute" as const,
      left: 1,
      right: 1,
      borderRadius: theme.borderRadius.sm,
      paddingHorizontal: 2,
      paddingVertical: 1,
      overflow: "hidden" as const,
    },
    nowIndicator: {
      position: "absolute" as const,
      left: 0,
      right: 0,
      height: 2,
      backgroundColor: "#ef4444",
      zIndex: 10,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    hourLabel: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    },
    eventTitle: {
      fontSize: 10,
      lineHeight: 12,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
    },
    eventTime: {
      fontSize: 9,
      lineHeight: 11,
      opacity: 0.8,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

export type { ThreeDayTimelineProps };
