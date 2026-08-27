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
import { useRouter, useSegments } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../providers/ThemeProvider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCommandPalette } from "../providers/CommandPaletteProvider";
import { useSheet } from "../providers/SheetProvider";
import { useCalendarView } from "../providers/CalendarViewProvider";
import { useMailSelection } from "../providers/MailSelectionProvider";
import { calendarApiService } from "../lib/api";
import {
  CALENDAR_TAB_ROUTE,
  MAIL_TAB_ROUTE,
  SETTINGS_ROUTE,
  SETTINGS_NOTIFICATIONS_ROUTE,
  isMailRouteSegments,
} from "../lib/navigation-routes";
import { useMailAccount, useMailRuntime } from "../lib/mail/use-mail";
import { formatAddress } from "../lib/mail/mail-helpers";
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
} from "./BottomSheet";
import {
  buildCommandActions,
  filterCommandActions,
  groupCommandActions,
  type CommandAction,
  type CommandPaletteScope,
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

/**
 * Global command palette. Commands follow the active tab. Search looks across
 * the on-device title index plus live calendar/mail results.
 */
export function CommandPalette() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { isOpen, close } = useCommandPalette();
  const { openEventSheet } = useSheet();
  const { setActiveView, setCurrentDate, setSelectedDate } = useCalendarView();
  const router = useRouter();
  const segments = useSegments();
  const inputRef = useRef<TextInput>(null);
  const titleIndex = useNativeTitleIndex();

  const scope: CommandPaletteScope = isMailRouteSegments(segments)
    ? "mail"
    : "calendar";

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const accountQuery = useMailAccount();
  const mailProvisioned = accountQuery.data?.provisioned ?? false;
  const runtimeQuery = useMailRuntime(isOpen && mailProvisioned);
  const runtime = runtimeQuery.data;
  const { selectedMailboxId } = useMailSelection();

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

  const { data: mailSearchData, isFetching: mailSearchFetching } = useQuery({
    queryKey: [
      "command-palette-search",
      "mail",
      selectedMailboxId,
      trimmedQuery,
    ],
    queryFn: () =>
      runtime!.client.searchMailboxMessages(
        runtime!.session,
        selectedMailboxId!,
        trimmedQuery,
        SEARCH_LIMIT,
      ),
    enabled: searchEnabled && Boolean(runtime && selectedMailboxId),
    staleTime: 10_000,
  });

  const actions = useMemo(() => buildCommandActions(scope), [scope]);
  const filteredActions = useMemo(
    () => filterCommandActions(actions, query),
    [actions, query],
  );
  const actionSections = useMemo(
    () => groupCommandActions(filteredActions, scope),
    [filteredActions, scope],
  );

  const searchResults = useMemo(
    () =>
      searchEnabled
        ? mergePaletteSearchResults({
            titleDocuments: titleIndex.documents,
            query: trimmedQuery,
            events: eventSearchData?.events ?? [],
            messages: mailSearchData?.messages ?? [],
            limit: SEARCH_LIMIT,
          })
        : [],
    [
      eventSearchData?.events,
      mailSearchData?.messages,
      searchEnabled,
      titleIndex.documents,
      trimmedQuery,
    ],
  );
  const mailResults = searchResults.filter((result) => result.source === "mail");
  const calendarResults = searchResults.filter(
    (result) => result.source === "calendar",
  );

  const handleCloseComplete = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
  }, []);

  const navigateToCalendar = useCallback(() => {
    router.replace(CALENDAR_TAB_ROUTE as never);
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
          router.replace(MAIL_TAB_ROUTE as never);
          break;
        case "compose-mail":
          router.push(`${MAIL_TAB_ROUTE}/compose` as never);
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
      if (result.source === "mail") {
        router.push(`/(tabs)/mail/message/${result.messageId}` as never);
        return;
      }

      const start = new Date(result.event.start);
      if (!Number.isNaN(start.getTime()) && start.getTime() !== 0) {
        setCurrentDate(start);
        setSelectedDate(start);
      }
      openEventSheet({ type: "view", eventId: result.eventId });
      navigateToCalendar();
    },
    [close, navigateToCalendar, openEventSheet, router, setCurrentDate, setSelectedDate],
  );

  const showSearchResults = trimmedQuery.length >= SEARCH_MIN_LENGTH;
  const noActionMatches = !showSearchResults && filteredActions.length === 0;
  const searchFetching =
    eventSearchFetching || mailSearchFetching || titleIndex.isIndexing;
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
              placeholder="Mail, events, and commands"
              placeholderTextColor={theme.colors.mutedForeground}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search mail, events, and commands"
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
              label="Mail"
              fetching={searchFetching && mailResults.length === 0}
              theme={theme}
              styles={styles}
            />
            <View style={styles.sectionCard}>
              {mailResults.length === 0 ? (
                <Text style={styles.emptyText}>No matching messages.</Text>
              ) : (
                mailResults.map((result, index) => (
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
        style={({ pressed }) => [styles.sectionRow, pressed && styles.rowPressed]}
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
  const subtitle = formatSearchSubtitle(result);
  const icon = result.source === "mail" ? "mail" : "calendar";

  return (
    <View>
      {showDivider ? <View style={styles.sectionDivider} /> : null}
      <Pressable
        style={({ pressed }) => [styles.sectionRow, pressed && styles.rowPressed]}
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

function formatSearchSubtitle(result: NativePaletteSearchResult): string | null {
  if (result.source === "mail") {
    const from =
      result.from ??
      formatAddress(result.message.from) ??
      result.snippet ??
      null;
    const receivedAt = result.timestamp
      ? format(new Date(result.timestamp), "MMM d")
      : null;
    const parts = [from, receivedAt].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : null;
  }

  const start = new Date(result.event.start);
  if (Number.isNaN(start.getTime()) || start.getTime() === 0) {
    return result.snippet ?? null;
  }
  return result.event.allDay
    ? format(start, "EEE, MMM d")
    : format(start, "EEE, MMM d · p");
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
