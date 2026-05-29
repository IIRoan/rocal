import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { CalendarEvent } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../providers/ThemeProvider";
import { useCommandPalette } from "../providers/CommandPaletteProvider";
import { useSheet } from "../providers/SheetProvider";
import { useCalendarView } from "../providers/CalendarViewProvider";
import { calendarApiService } from "../lib/api";

import { BottomSheet } from "./BottomSheet";
import {
  buildCommandActions,
  filterCommandActions,
  groupCommandActions,
  type CommandAction,
} from "./command-palette/command-actions";

const SEARCH_MIN_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_LIMIT = 8;

/**
 * Global, gesture-driven command palette rendered once at the root. Reuses the
 * shared `BottomSheet` so it shares the calendar's smooth drag-to-dismiss feel.
 * Combines quick actions (navigation, views, compose) with live event search.
 */
export function CommandPalette() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { isOpen, close } = useCommandPalette();
  const { openEventSheet } = useSheet();
  const { setActiveView, setCurrentDate, setSelectedDate } = useCalendarView();
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Focus the input shortly after the sheet animates open.
  useEffect(() => {
    if (!isOpen) return;
    const timeout = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(timeout);
  }, [isOpen]);

  // Debounce the query that drives the event search.
  useEffect(() => {
    const timeout = setTimeout(
      () => setDebouncedQuery(query),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timeout);
  }, [query]);

  const trimmedQuery = debouncedQuery.trim();
  const searchEnabled = isOpen && trimmedQuery.length >= SEARCH_MIN_LENGTH;

  const { data: searchData, isFetching: searchFetching } = useQuery({
    queryKey: ["command-palette-search", trimmedQuery],
    queryFn: ({ signal }) =>
      calendarApiService.searchEvents(
        { q: trimmedQuery, limit: SEARCH_LIMIT },
        signal,
      ),
    enabled: searchEnabled,
    staleTime: 10_000,
  });

  const actions = useMemo(() => buildCommandActions(), []);
  const filteredActions = useMemo(
    () => filterCommandActions(actions, query),
    [actions, query],
  );
  const actionSections = useMemo(
    () => groupCommandActions(filteredActions),
    [filteredActions],
  );

  const handleCloseComplete = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
  }, []);

  const navigateToCalendar = useCallback(() => {
    router.replace("/(tabs)/calendar" as never);
  }, [router]);

  const runAction = useCallback(
    (action: CommandAction) => {
      close();
      switch (action.id) {
        case "new-event":
          openEventSheet({ type: "create" });
          break;
        case "go-today": {
          const now = new Date();
          setCurrentDate(now);
          setSelectedDate(now);
          navigateToCalendar();
          break;
        }
        case "view-month":
        case "view-week":
        case "view-day":
        case "view-3day":
        case "view-agenda":
          if (action.view) setActiveView(action.view);
          navigateToCalendar();
          break;
        case "open-calendar":
          navigateToCalendar();
          break;
        case "open-mail":
          router.replace("/(tabs)/mail" as never);
          break;
        case "compose-mail":
          router.push("/(tabs)/mail/compose" as never);
          break;
        case "open-settings":
          router.replace("/(tabs)/settings" as never);
          break;
      }
    },
    [
      close,
      openEventSheet,
      setActiveView,
      setCurrentDate,
      setSelectedDate,
      navigateToCalendar,
      router,
    ],
  );

  const handleEventPress = useCallback(
    (event: CalendarEvent) => {
      close();
      const start = new Date(event.start);
      if (!Number.isNaN(start.getTime())) {
        setCurrentDate(start);
        setSelectedDate(start);
      }
      openEventSheet({ type: "view", eventId: event.id });
      navigateToCalendar();
    },
    [close, openEventSheet, setCurrentDate, setSelectedDate, navigateToCalendar],
  );

  const events = searchData?.events ?? [];
  const showSearchResults = trimmedQuery.length >= SEARCH_MIN_LENGTH;
  const noActionMatches = !showSearchResults && filteredActions.length === 0;

  return (
    <BottomSheet
      visible={isOpen}
      onDismiss={close}
      onCloseComplete={handleCloseComplete}
      title="Command palette"
    >
      <View style={styles.searchRow}>
        <Feather
          name="search"
          size={18}
          color={theme.colors.mutedForeground}
        />
        <TextInput
          ref={inputRef}
          style={styles.searchInput}
          placeholder="Search events or run a command…"
          placeholderTextColor={theme.colors.mutedForeground}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Command palette search"
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery("")}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Feather name="x" size={18} color={theme.colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {showSearchResults ? (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>Events</Text>
              {searchFetching ? (
                <ActivityIndicator
                  size="small"
                  color={theme.colors.mutedForeground}
                />
              ) : null}
            </View>
            {events.length === 0 && !searchFetching ? (
              <Text style={styles.emptyText}>No matching events.</Text>
            ) : (
              events.map((event) => (
                <EventResultRow
                  key={event.id}
                  event={event}
                  theme={theme}
                  styles={styles}
                  onPress={handleEventPress}
                />
              ))
            )}
          </View>
        ) : noActionMatches ? (
          <Text style={styles.emptyText}>No matching commands.</Text>
        ) : (
          actionSections.map((section) => (
            <View key={section.group} style={styles.section}>
              <Text style={styles.sectionLabel}>{section.group}</Text>
              {section.actions.map((action) => (
                <ActionRow
                  key={action.id}
                  action={action}
                  theme={theme}
                  styles={styles}
                  onPress={runAction}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </BottomSheet>
  );
}

// ─── Rows ──────────────────────────────────────────────────────────────────

type Styles = ReturnType<typeof createStyles>;

function ActionRow({
  action,
  theme,
  styles,
  onPress,
}: {
  action: CommandAction;
  theme: ThemeTokens;
  styles: Styles;
  onPress: (action: CommandAction) => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => onPress(action)}
      accessibilityRole="button"
      accessibilityLabel={action.label}
    >
      <View style={styles.rowIcon}>
        <Feather name={action.icon} size={18} color={theme.colors.foreground} />
      </View>
      <Text style={styles.rowLabel} numberOfLines={1}>
        {action.label}
      </Text>
    </Pressable>
  );
}

function EventResultRow({
  event,
  theme,
  styles,
  onPress,
}: {
  event: CalendarEvent;
  theme: ThemeTokens;
  styles: Styles;
  onPress: (event: CalendarEvent) => void;
}) {
  const start = new Date(event.start);
  const subtitle = Number.isNaN(start.getTime())
    ? null
    : event.allDay
      ? format(start, "EEE, MMM d")
      : format(start, "EEE, MMM d • p");

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => onPress(event)}
      accessibilityRole="button"
      accessibilityLabel={event.title || "Untitled event"}
    >
      <View style={styles.rowIcon}>
        <Feather name="calendar" size={18} color={theme.colors.foreground} />
      </View>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowLabel} numberOfLines={1}>
          {event.title || "Untitled event"}
        </Text>
        {subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  const view = {
    searchRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      marginHorizontal: theme.spacing["4"],
      marginBottom: theme.spacing["2"],
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.secondary,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: theme.spacing["4"],
      paddingBottom: theme.spacing["6"],
    },
    section: {
      marginBottom: theme.spacing["4"],
    },
    sectionHeaderRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
    },
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["3"],
      paddingVertical: theme.spacing["3"],
      paddingHorizontal: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
    },
    rowPressed: {
      backgroundColor: theme.colors.muted,
    },
    rowIcon: {
      width: 28,
      alignItems: "center" as const,
    },
    rowTextWrap: {
      flex: 1,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    searchInput: {
      flex: 1,
      fontSize: theme.typography.fontSize.base.size,
      color: theme.colors.foreground,
      padding: 0,
    },
    sectionLabel: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      textTransform: "uppercase" as const,
      letterSpacing: 0.5,
      color: theme.colors.mutedForeground,
      marginBottom: theme.spacing["1"],
    },
    rowLabel: {
      flex: 1,
      fontSize: theme.typography.fontSize.base.size,
      color: theme.colors.foreground,
    },
    rowSubtitle: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
      marginTop: 1,
    },
    emptyText: {
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.mutedForeground,
      paddingVertical: theme.spacing["4"],
      textAlign: "center" as const,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
