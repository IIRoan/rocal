import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clockTimePattern,
  formatInUserTimezone,
  resolveTimezone,
  utcToPickerDate,
  type TimeFormat,
  type UserSettings,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCommandPalette } from "@workspace/native-core/providers/CommandPaletteProvider";
import { useSheet } from "../providers/SheetProvider";
import { useUserTimeFormat } from "@workspace/native-core/hooks/use-user-time-format";
import { useUserTimezone } from "@workspace/native-core/hooks/use-user-timezone";
import { useCalendarView } from "../providers/CalendarViewProvider";
import { calendarApiService } from "@workspace/native-core/lib/api";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import {
  SETTINGS_ROUTE,
  SETTINGS_NOTIFICATIONS_ROUTE,
} from "@workspace/native-core/lib/navigation-routes";
import { CALENDAR_HOME_ROUTE } from "../lib/calendar-routes";
import { useNativeTitleIndex } from "../hooks/use-native-title-index";
import {
  mergePaletteSearchResults,
  type NativePaletteSearchResult,
} from "../lib/search/palette-search";

import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetScrollView,
  BottomSheetTitle,
} from "@workspace/native-core/components/BottomSheet";
import {
  buildCommandActions,
  filterCommandActions,
  groupCommandActions,
  type CommandAction,
} from "./command-palette/command-actions";

const SEARCH_MIN_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_LIMIT = 12;

function IconBox({
  name,
  color,
  bg,
}: {
  name: React.ComponentProps<typeof Feather>["name"];
  color: string;
  bg: string;
}) {
  return (
    <View
      style={{
        width: 32,
        height: 32,
        borderRadius: 9,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg,
      }}
    >
      <Feather name={name} size={16} color={color} />
    </View>
  );
}

/** Calendar commands plus search over the on-device title index and live event results. */
export function CommandPalette() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { isOpen, close } = useCommandPalette();
  const { openEventSheet } = useSheet();
  const { setActiveView, setCurrentDate, setSelectedDate } = useCalendarView();
  const queryClient = useQueryClient();
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const titleIndex = useNativeTitleIndex();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const timeout = setTimeout(() => inputRef.current?.focus(), 400);
    return () => clearTimeout(timeout);
  }, [isOpen]);

  useEffect(() => {
    const timeout = setTimeout(
      () => setDebouncedQuery(query),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timeout);
  }, [query]);

  const trimmedQuery = debouncedQuery.trim();
  const searchEnabled = isOpen && trimmedQuery.length >= SEARCH_MIN_LENGTH;

  const { data: eventSearchData, isFetching: eventSearchFetching } = useQuery({
    queryKey: ["command-palette-search", "events", trimmedQuery],
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

  const searchResults = useMemo(
    () =>
      searchEnabled
        ? mergePaletteSearchResults({
            titleDocuments: titleIndex.documents,
            query: trimmedQuery,
            events: eventSearchData?.events ?? [],
            limit: SEARCH_LIMIT,
          })
        : [],
    [
      eventSearchData?.events,
      searchEnabled,
      titleIndex.documents,
      trimmedQuery,
    ],
  );
  const calendarResults = searchResults;

  const handleCloseComplete = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
  }, []);

  const navigateToCalendar = useCallback(() => {
    router.navigate(CALENDAR_HOME_ROUTE as never);
  }, [router]);

  const runAction = useCallback(
    (action: CommandAction) => {
      close();
      switch (action.id) {
        case "new-event":
          openEventSheet({ type: "create" });
          break;
        case "go-today": {
          const timezone = resolveTimezone(
            queryClient.getQueryData<UserSettings>(QUERY_KEYS.settings())?.timezone,
          );
          const today = utcToPickerDate(new Date(), timezone);
          setCurrentDate(today);
          setSelectedDate(today);
          navigateToCalendar();
          break;
        }
        case "view-week":
        case "view-day":
        case "view-3day":
          if (action.view) setActiveView(action.view);
          navigateToCalendar();
          break;
        case "open-calendar":
          navigateToCalendar();
          break;
        case "open-settings":
          router.push(SETTINGS_ROUTE as never);
          break;
        case "open-notification-settings":
          router.push(SETTINGS_NOTIFICATIONS_ROUTE as never);
          break;
      }
    },
    [
      close,
      openEventSheet,
      queryClient,
      setActiveView,
      setCurrentDate,
      setSelectedDate,
      navigateToCalendar,
      router,
    ],
  );

  const handleSearchResultPress = useCallback(
    (result: NativePaletteSearchResult) => {
      close();
      const start = new Date(result.event.start);
      if (!Number.isNaN(start.getTime()) && start.getTime() !== 0) {
        setCurrentDate(start);
        setSelectedDate(start);
      }
      openEventSheet({ type: "view", eventId: result.eventId });
      navigateToCalendar();
    },
    [close, navigateToCalendar, openEventSheet, setCurrentDate, setSelectedDate],
  );

  const showSearchResults = trimmedQuery.length >= SEARCH_MIN_LENGTH;
  const noActionMatches = !showSearchResults && filteredActions.length === 0;
  const searchFetching = eventSearchFetching || titleIndex.isIndexing;
  const iconColor = theme.colors.mutedForeground;
  const iconBg = theme.colors.mutedForeground + "18";

  return (
    <BottomSheet
      visible={isOpen}
      onDismiss={close}
      onCloseComplete={handleCloseComplete}
    >
      <BottomSheetHeader>
        <BottomSheetTitle>Search</BottomSheetTitle>
      </BottomSheetHeader>

      <BottomSheetScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 8 },
        ]}
      >
        <View style={styles.sectionCard}>
          <View style={styles.searchRow}>
            <Feather
              name="search"
              size={16}
              color={theme.colors.mutedForeground}
            />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder="Events and commands"
              placeholderTextColor={theme.colors.mutedForeground}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search events and commands"
            />
            {query.length > 0 ? (
              <Pressable
                onPress={() => setQuery("")}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Feather
                  name="x"
                  size={16}
                  color={theme.colors.mutedForeground}
                />
              </Pressable>
            ) : null}
          </View>
        </View>

        {showSearchResults ? (
          <>
            <SectionHeading
              label="Events"
              fetching={searchFetching && calendarResults.length === 0}
              theme={theme}
              styles={styles}
            />
            <View style={styles.sectionCard}>
              {calendarResults.length === 0 ? (
                <Text style={styles.emptyText}>No matching events.</Text>
              ) : (
                calendarResults.map((result, index) => (
                  <SearchResultRow
                    key={result.id}
                    result={result}
                    theme={theme}
                    styles={styles}
                    iconColor={iconColor}
                    iconBg={iconBg}
                    showDivider={index > 0}
                    onPress={handleSearchResultPress}
                  />
                ))
              )}
            </View>
          </>
        ) : noActionMatches ? (
          <View style={styles.sectionCard}>
            <Text style={styles.emptyText}>No matching commands.</Text>
          </View>
        ) : (
          actionSections.map((section) => (
            <View key={section.group}>
              <Text style={styles.sectionLabel}>{section.group}</Text>
              <View style={styles.sectionCard}>
                {section.actions.map((action, index) => (
                  <ActionRow
                    key={action.id}
                    action={action}
                    theme={theme}
                    styles={styles}
                    iconColor={iconColor}
                    iconBg={iconBg}
                    showDivider={index > 0}
                    onPress={runAction}
                  />
                ))}
              </View>
            </View>
          ))
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

type Styles = ReturnType<typeof createStyles>;

function SectionHeading({
  label,
  fetching,
  theme,
  styles,
}: {
  label: string;
  fetching: boolean;
  theme: ThemeTokens;
  styles: Styles;
}) {
  return (
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {fetching ? (
        <ActivityIndicator size="small" color={theme.colors.mutedForeground} />
      ) : null}
    </View>
  );
}

function ActionRow({
  action,
  styles,
  iconColor,
  iconBg,
  showDivider,
  onPress,
}: {
  action: CommandAction;
  theme: ThemeTokens;
  styles: Styles;
  iconColor: string;
  iconBg: string;
  showDivider: boolean;
  onPress: (action: CommandAction) => void;
}) {
  return (
    <View>
      {showDivider ? <View style={styles.sectionDivider} /> : null}
      <Pressable
        style={({ pressed }) => [
          styles.sectionRow,
          pressed && styles.rowPressed,
        ]}
        onPress={() => onPress(action)}
        accessibilityRole="button"
        accessibilityLabel={action.label}
      >
        <IconBox name={action.icon} color={iconColor} bg={iconBg} />
        <Text style={styles.rowLabel} numberOfLines={1}>
          {action.label}
        </Text>
      </Pressable>
    </View>
  );
}

function SearchResultRow({
  result,
  styles,
  iconColor,
  iconBg,
  showDivider,
  onPress,
}: {
  result: NativePaletteSearchResult;
  theme: ThemeTokens;
  styles: Styles;
  iconColor: string;
  iconBg: string;
  showDivider: boolean;
  onPress: (result: NativePaletteSearchResult) => void;
}) {
  const timezone = useUserTimezone();
  const timeFormat = useUserTimeFormat();
  const subtitle = formatSearchSubtitle(result, timezone, timeFormat);
  const icon = "calendar";

  return (
    <View>
      {showDivider ? <View style={styles.sectionDivider} /> : null}
      <Pressable
        style={({ pressed }) => [
          styles.sectionRow,
          pressed && styles.rowPressed,
        ]}
        onPress={() => onPress(result)}
        accessibilityRole="button"
        accessibilityLabel={result.title}
      >
        <IconBox name={icon} color={iconColor} bg={iconBg} />
        <View style={styles.rowTextWrap}>
          <Text style={styles.rowLabel} numberOfLines={1}>
            {result.title || "Untitled"}
          </Text>
          {subtitle ? (
            <Text style={styles.rowSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

function formatSearchSubtitle(
  result: NativePaletteSearchResult,
  timezone: string,
  timeFormat: TimeFormat,
): string | null {
  const start = new Date(result.event.start);
  if (Number.isNaN(start.getTime()) || start.getTime() === 0) {
    return result.snippet ?? null;
  }
  return result.event.allDay
    ? formatInUserTimezone(start, timezone, "EEE, MMM d")
    : formatInUserTimezone(
        start,
        timezone,
        `EEE, MMM d · ${clockTimePattern(timeFormat)}`,
      );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 20,
    },
    sectionCard: {
      backgroundColor: theme.colors.muted + "28",
      borderRadius: theme.borderRadius.lg,
      marginBottom: 8,
      overflow: "hidden" as const,
    },
    sectionRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      minHeight: 44,
    },
    sectionDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border + "60",
      marginLeft: 14 + 32 + 12,
    },
    sectionHeaderRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
    },
    searchRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    rowPressed: {
      backgroundColor: theme.colors.muted + "40",
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
      marginTop: theme.spacing["2"],
      paddingHorizontal: 4,
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
      paddingHorizontal: 14,
      textAlign: "center" as const,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
