import { memo, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
  type SectionListRenderItemInfo,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  buildAgendaSections,
  isCancelledCalendarEvent,
  isSamePickerDay,
  resolveTimezone,
  utcToPickerDate,
  type AgendaDaySection,
  type DecoratedCalendarEvent,
  type TimeFormat,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { resolveEventBlockColor } from "../../lib/calendar-color-utils";
import {
  formatAgendaEventSubtitle,
  formatAgendaEventTime,
  formatAgendaSectionHeader,
} from "./agenda-view-utils";
import { useCurrentDateTime } from "./useCurrentDateTime";

interface NativeAgendaViewProps {
  selectedDate: Date;
  events: DecoratedCalendarEvent[];
  timezone: string;
  timeFormat: TimeFormat;
  isLoading?: boolean;
  onEventPress: (eventId: string) => void;
}

interface AgendaStyleProps {
  theme: ThemeTokens;
  styles: ReturnType<typeof createStyles>;
}

const AgendaSectionHeader = memo(function AgendaSectionHeader({
  date,
  isToday,
  styles,
}: {
  date: Date;
  isToday: boolean;
  styles: AgendaStyleProps["styles"];
}) {
  const header = formatAgendaSectionHeader(date);
  const dayNumberStyle = isToday ? styles.dayNumberToday : styles.dayNumber;
  const weekdayStyle = isToday ? styles.weekdayToday : styles.weekday;

  return (
    <View style={styles.sectionHeader}>
      <Text style={dayNumberStyle} allowFontScaling={false}>
        {header.day}
      </Text>
      <Text style={weekdayStyle} allowFontScaling={false}>
        {header.weekday}
      </Text>
      <Text style={styles.monthLabel} allowFontScaling={false}>
        {header.month}
      </Text>
      {isToday && (
        <View style={styles.todayPill}>
          <Text style={styles.todayPillText} allowFontScaling={false}>
            Today
          </Text>
        </View>
      )}
    </View>
  );
});

const AgendaEventRow = memo(function AgendaEventRow({
  event,
  sectionDay,
  timeFormat,
  timezone,
  onEventPress,
  theme,
  styles,
}: AgendaStyleProps & {
  event: DecoratedCalendarEvent;
  sectionDay: Date;
  timeFormat: TimeFormat;
  timezone: string;
  onEventPress: (eventId: string) => void;
}) {
  const colors = resolveEventBlockColor(event.color, theme);
  const time = formatAgendaEventTime(event, sectionDay, timeFormat, timezone);
  const subtitle = formatAgendaEventSubtitle(event, timezone);
  const titleStyle = isCancelledCalendarEvent(event)
    ? styles.cancelledTitle
    : styles.eventTitle;
  const handlePress = useCallback(
    () => onEventPress(event.id),
    [event.id, onEventPress],
  );

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => (pressed ? styles.eventRowPressed : styles.eventRow)}
      accessibilityRole="button"
      accessibilityLabel={event.title}
    >
      <View style={styles.timeColumn}>
        <Text
          style={time.start === "All day" ? styles.allDayLabel : styles.timeStart}
          numberOfLines={1}
          allowFontScaling={false}
        >
          {time.start}
        </Text>
        {time.end !== "" && (
          <Text style={styles.timeEnd} numberOfLines={1} allowFontScaling={false}>
            {time.end}
          </Text>
        )}
      </View>
      <View
        style={[styles.eventDot, { backgroundColor: colors.bg }]}
        accessibilityElementsHidden
      />
      <View style={styles.eventBody}>
        <Text style={titleStyle} numberOfLines={2}>
          {event.title}
        </Text>
        {subtitle ? (
          <Text style={styles.eventSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});

type AgendaSection = AgendaDaySection<DecoratedCalendarEvent>;

export function NativeAgendaView({
  selectedDate,
  events,
  timezone,
  timeFormat,
  isLoading = false,
  onEventPress,
}: NativeAgendaViewProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const resolvedTimezone = resolveTimezone(timezone);
  const now = useCurrentDateTime();

  const today = useMemo(
    () => utcToPickerDate(now, resolvedTimezone),
    [now, resolvedTimezone],
  );

  const sections = useMemo(
    () => buildAgendaSections(events, selectedDate, resolvedTimezone),
    [events, selectedDate, resolvedTimezone],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: AgendaSection }) => (
      <AgendaSectionHeader
        date={section.date}
        isToday={isSamePickerDay(section.date, today)}
        styles={styles}
      />
    ),
    [styles, today],
  );

  const renderItem = useCallback(
    ({ item, section }: SectionListRenderItemInfo<DecoratedCalendarEvent, AgendaSection>) => (
      <AgendaEventRow
        event={item}
        sectionDay={section.date}
        timeFormat={timeFormat}
        timezone={resolvedTimezone}
        onEventPress={onEventPress}
        theme={theme}
        styles={styles}
      />
    ),
    [onEventPress, resolvedTimezone, styles, theme, timeFormat],
  );

  if (isLoading && events.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.mutedForeground} />
      </View>
    );
  }

  return (
    <SectionList<DecoratedCalendarEvent, AgendaSection>
      style={styles.list}
      sections={sections}
      keyExtractor={agendaKeyExtractor}
      stickySectionHeadersEnabled
      contentContainerStyle={styles.listContent}
      renderSectionHeader={renderSectionHeader}
      renderItem={renderItem}
      ListEmptyComponent={
        <View style={styles.centered}>
          <Feather
            name="calendar"
            size={32}
            color={theme.colors.mutedForeground}
          />
          <Text style={styles.emptyTitle}>No events found</Text>
          <Text style={styles.emptyBody}>
            There are no events scheduled for this time period.
          </Text>
        </View>
      }
    />
  );
}

function agendaKeyExtractor(event: DecoratedCalendarEvent): string {
  return event.id;
}

function createStyles(theme: ThemeTokens) {
  const eventRow: ViewStyle = {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing["3"],
    minHeight: 44,
    paddingVertical: theme.spacing["2"],
    paddingHorizontal: theme.spacing["1"],
  };
  const dayNumber: TextStyle = {
    fontSize: theme.typography.fontSize["2xl"].size,
    lineHeight: theme.typography.fontSize["2xl"].lineHeight,
    fontWeight: "300",
    color: theme.colors.foreground,
  };
  const weekday: TextStyle = {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.mutedForeground,
    textTransform: "uppercase",
  };
  const eventTitle: TextStyle = {
    fontSize: theme.typography.fontSize.sm.size,
    lineHeight: theme.typography.fontSize.sm.lineHeight,
    fontWeight: "500",
    color: theme.colors.foreground,
  };

  const view = {
    list: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    listContent: {
      flexGrow: 1,
      paddingHorizontal: theme.spacing["4"],
      paddingBottom: theme.spacing["8"],
    },
    centered: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: theme.spacing["2"],
      padding: theme.spacing["8"],
      backgroundColor: theme.colors.background,
    },
    sectionHeader: {
      flexDirection: "row" as const,
      alignItems: "baseline" as const,
      gap: theme.spacing["2"],
      backgroundColor: theme.colors.background,
      paddingTop: theme.spacing["3"],
      paddingBottom: theme.spacing["2"],
    },
    todayPill: {
      marginLeft: "auto" as const,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.primaryBase + "1A",
      paddingHorizontal: theme.spacing["2"],
      paddingVertical: 2,
    },
    eventRow,
    eventRowPressed: { ...eventRow, opacity: 0.7 },
    timeColumn: {
      width: 68,
      alignItems: "flex-end" as const,
      paddingTop: 2,
    },
    eventDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginTop: 6,
    },
    eventBody: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    dayNumber,
    dayNumberToday: { ...dayNumber, color: theme.colors.primaryBase },
    weekday,
    weekdayToday: { ...weekday, color: theme.colors.primaryBase },
    monthLabel: {
      fontSize: 11,
      color: theme.colors.mutedForeground,
      textTransform: "uppercase" as const,
    },
    todayPillText: {
      fontSize: 10,
      fontWeight: "600" as TextStyle["fontWeight"],
      color: theme.colors.primaryBase,
      textTransform: "uppercase" as const,
    },
    timeStart: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: "600" as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    timeEnd: {
      fontSize: 11,
      lineHeight: 14,
      color: theme.colors.mutedForeground,
    },
    allDayLabel: {
      fontSize: 11,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
      textTransform: "uppercase" as const,
    },
    eventTitle,
    cancelledTitle: {
      ...eventTitle,
      textDecorationLine: "line-through" as const,
      opacity: 0.7,
    },
    eventSubtitle: {
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.mutedForeground,
    },
    emptyTitle: {
      fontSize: theme.typography.fontSize.lg.size,
      lineHeight: theme.typography.fontSize.lg.lineHeight,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: theme.colors.foreground,
      textAlign: "center" as const,
    },
    emptyBody: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
      textAlign: "center" as const,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

export type { NativeAgendaViewProps };
