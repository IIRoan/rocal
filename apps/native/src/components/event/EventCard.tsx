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
import type { DecoratedCalendarEvent } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { resolveEventBlockColor } from "../calendar/timeline-utils";
import { formatTimeRange } from "./event-card-utils";

// ─── Props ───────────────────────────────────────────────────────────────────

interface EventCardProps {
  /** The event to display */
  event: DecoratedCalendarEvent;
  /** Time format: "12h" or "24h" */
  timeFormat?: "12h" | "24h";
  /** Callback when the card is tapped */
  onPress?: (event: DecoratedCalendarEvent) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EventCard({
  event,
  timeFormat = "12h",
  onPress,
}: EventCardProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const colors = resolveEventBlockColor(event.color, theme);
  const timeLabel = formatTimeRange(event, timeFormat);
  const categoryColor = event.category?.color;

  const accessibilityParts = [event.title, timeLabel];
  if (event.calendar?.name) accessibilityParts.push(event.calendar.name);

  return (
    <Pressable
      style={styles.container}
      onPress={() => onPress?.(event)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityParts.join(", ")}
    >
      {/* Calendar color indicator */}
      <View style={[styles.colorBar, { backgroundColor: colors.bg }]} />

      <View style={styles.content}>
        <Text
          style={[styles.title, { color: colors.fg }]}
          numberOfLines={1}
        >
          {event.title}
        </Text>

        <View style={styles.metaRow}>
          <Text style={styles.time} numberOfLines={1}>
            {timeLabel}
          </Text>

          {categoryColor ? (
            <View
              style={[
                styles.categoryDot,
                { backgroundColor: categoryColor },
              ]}
            />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      flexDirection: "row" as const,
      backgroundColor: theme.colors.card,
      borderRadius: theme.borderRadius.sm,
      overflow: "hidden" as const,
      minHeight: 36,
    },
    colorBar: {
      width: 3,
    },
    content: {
      flex: 1,
      paddingHorizontal: theme.spacing["2"],
      paddingVertical: 2,
      justifyContent: "center" as const,
    },
    metaRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      marginTop: 1,
    },
    categoryDot: {
      width: 6,
      height: 6,
      borderRadius: theme.borderRadius.full,
      marginLeft: theme.spacing["1"],
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    title: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
    },
    time: {
      fontSize: 10,
      lineHeight: 12,
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

export type { EventCardProps };
