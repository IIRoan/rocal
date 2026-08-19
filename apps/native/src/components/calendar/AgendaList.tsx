import React, { useCallback, useMemo } from "react";
import {
  SectionList,
  StyleSheet,
  Text,
  View,
  Pressable,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import type { DecoratedCalendarEvent } from "@workspace/calendar-core";
import { canCurrentUserDeleteEvent } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { resolveEventBlockColor } from "../../lib/calendar-color-utils";
import {
  groupEventsIntoSections,
  formatEventTime,
  type AgendaSection,
} from "./agenda-utils";
import { EncryptionStatusIcon } from "./EncryptionStatusIcon";
import { shouldShowEncryptionIcon } from "./timeline-event-content";
import { SwipeableEventRow } from "../event/SwipeableEventRow";

// ─── Props ───────────────────────────────────────────────────────────────────

interface AgendaListProps {
  /** Events to display in chronological order */
  events: DecoratedCalendarEvent[];
  /** Time format: "12h" or "24h" */
  timeFormat?: "12h" | "24h";
  timezone?: string;
  /** Whether data is currently being refreshed */
  refreshing?: boolean;
  /** Callback when pull-to-refresh is triggered */
  onRefresh?: () => void;
  /** Callback when an event is tapped */
  onEventPress?: (event: DecoratedCalendarEvent) => void;
  /** Callback when an event is deleted via swipe-to-delete */
  onEventDelete?: (eventId: string) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AgendaList({
  events,
  timeFormat = "12h",
  timezone,
  refreshing = false,
  onRefresh,
  onEventPress,
  onEventDelete,
}: AgendaListProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const sections = useMemo(
    () => groupEventsIntoSections(events, timezone),
    [events, timezone],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: AgendaSection }) => (
      <View
        style={styles.sectionHeader}
        accessibilityRole="header"
        accessibilityLabel={section.title}
      >
        <Text style={styles.sectionHeaderText}>{section.title}</Text>
      </View>
    ),
    [styles],
  );

  const renderItem = useCallback(
    ({ item }: { item: DecoratedCalendarEvent }) => {
      const colors = resolveEventBlockColor(item.color, theme);
      const calendarName = item.calendar?.name;
      const timeLabel = formatEventTime(item, timeFormat, timezone);
      const encrypted = shouldShowEncryptionIcon(item);

      const accessibilityParts = [item.title, timeLabel];
      if (encrypted) {
        accessibilityParts.push("encrypted");
      }
      if (calendarName) accessibilityParts.push(calendarName);

      const rowContent = (
        <Pressable
          style={styles.eventRow}
          onPress={() => onEventPress?.(item)}
          accessibilityRole="button"
          accessibilityLabel={accessibilityParts.join(", ")}
        >
          <View style={[styles.colorBar, { backgroundColor: colors.bg }]} />

          <View style={styles.eventContent}>
            <View style={styles.titleRow}>
              <EncryptionStatusIcon
                encrypted={encrypted}
                color={theme.colors.cardForeground}
                size={14}
              />
              <Text style={styles.eventTitle} numberOfLines={1}>
                {item.title}
              </Text>
            </View>
            <Text style={styles.eventTime} numberOfLines={1}>
              {timeLabel}
            </Text>
            {calendarName ? (
              <View style={styles.metaRow}>
                <Text style={styles.calendarName} numberOfLines={1}>
                  {calendarName}
                </Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      );

      if (onEventDelete) {
        return (
          <SwipeableEventRow
            eventId={item.id}
            eventTitle={item.title}
            onDelete={onEventDelete}
            enabled={canCurrentUserDeleteEvent(item)}
          >
            {rowContent}
          </SwipeableEventRow>
        );
      }

      return rowContent;
    },
    [
      onEventDelete,
      onEventPress,
      styles,
      theme,
      timeFormat,
      timezone,
    ],
  );

  if (events.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No upcoming events</Text>
      </View>
    );
  }

  return (
    <SectionList<DecoratedCalendarEvent, AgendaSection>
      sections={sections}
      stickySectionHeadersEnabled
      keyExtractor={(item) => item.id}
      refreshing={refreshing}
      onRefresh={onRefresh}
      renderSectionHeader={renderSectionHeader}
      renderItem={renderItem}
    />
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  const view = {
    emptyContainer: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      paddingVertical: theme.spacing["10"],
    },
    sectionHeader: {
      backgroundColor: theme.colors.muted,
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
    },
    eventRow: {
      flexDirection: "row" as const,
      backgroundColor: theme.colors.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
      paddingVertical: theme.spacing["3"],
      paddingRight: theme.spacing["4"],
    },
    colorBar: {
      width: 4,
      borderTopRightRadius: theme.borderRadius.sm,
      borderBottomRightRadius: theme.borderRadius.sm,
      marginRight: theme.spacing["3"],
    },
    eventContent: {
      flex: 1,
      justifyContent: "center" as const,
    },
    titleRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
    },
    metaRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      marginTop: 2,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    emptyText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.mutedForeground,
    },
    sectionHeaderText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    eventTitle: {
      flex: 1,
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.cardForeground,
    },
    eventTime: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
      marginTop: 2,
    },
    calendarName: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

export type { AgendaListProps };
