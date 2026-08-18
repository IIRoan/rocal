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
import type { CalendarEvent } from "@workspace/calendar-core";
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
  isMailRouteSegments,
} from "../lib/navigation-routes";
import { useMailAccount } from "../lib/mail/use-mail";
import { useMailRuntime } from "../lib/mail/use-mail";
import { formatAddress } from "../lib/mail/mail-helpers";
import type { JmapEmailMessage } from "../lib/mail/types";

import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetScrollView,
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
const SEARCH_LIMIT = 8;

/**
 * Global command palette. Scope follows the active tab: mail screens search
 * messages and show mail actions only; calendar screens search events.
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

  const scope: CommandPaletteScope = isMailRouteSegments(segments)
    ? "mail"
    : "calendar";

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const accountQuery = useMailAccount();
  const mailProvisioned = accountQuery.data?.provisioned ?? false;
  const runtimeQuery = useMailRuntime(scope === "mail" && mailProvisioned);
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
    enabled: scope === "calendar" && searchEnabled,
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
    enabled:
      scope === "mail" &&
      searchEnabled &&
      Boolean(runtime && selectedMailboxId),
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

  const handleMailMessagePress = useCallback(
    (message: JmapEmailMessage) => {
      close();
      router.push(`/(tabs)/mail/message/${message.id}` as never);
    },
    [close, router],
  );

  const events = eventSearchData?.events ?? [];
  const mailMessages = mailSearchData?.messages ?? [];
  const showSearchResults = trimmedQuery.length >= SEARCH_MIN_LENGTH;
  const noActionMatches = !showSearchResults && filteredActions.length === 0;
  const searchPlaceholder =
    scope === "mail"
      ? "Search mail or run a command…"
      : "Search events or run a command…";
  const searchFetching =
    scope === "mail" ? mailSearchFetching : eventSearchFetching;

  return (
    <BottomSheet
      visible={isOpen}
      onDismiss={close}
      onCloseComplete={handleCloseComplete}
    >
      <BottomSheetHeader showClose={false}>
        <View style={styles.searchRow}>
          <Feather
            name="search"
            size={18}
            color={theme.colors.mutedForeground}
          />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder={searchPlaceholder}
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
      </BottomSheetHeader>

      <BottomSheetScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 8 },
        ]}
      >
        {showSearchResults ? (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>
                {scope === "mail" ? "Messages" : "Events"}
              </Text>
              {searchFetching ? (
                <ActivityIndicator
                  size="small"
                  color={theme.colors.mutedForeground}
                />
              ) : null}
            </View>
            {scope === "mail" ? (
              mailMessages.length === 0 && !searchFetching ? (
                <Text style={styles.emptyText}>No matching messages.</Text>
              ) : (
                mailMessages.map((message) => (
                  <MailMessageResultRow
                    key={message.id}
                    message={message}
                    theme={theme}
                    styles={styles}
                    onPress={handleMailMessagePress}
                  />
                ))
              )
            ) : events.length === 0 && !searchFetching ? (
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
      </BottomSheetScrollView>
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

function MailMessageResultRow({
  message,
  theme,
  styles,
  onPress,
}: {
  message: JmapEmailMessage;
  theme: ThemeTokens;
  styles: Styles;
  onPress: (message: JmapEmailMessage) => void;
}) {
  const title = message.subject?.trim() || "(no subject)";
  const from = formatAddress(message.from);
  const receivedAt = message.receivedAt
    ? format(new Date(message.receivedAt), "MMM d")
    : null;
  const subtitle = [from, receivedAt].filter(Boolean).join(" · ");

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => onPress(message)}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.rowIcon}>
        <Feather name="mail" size={18} color={theme.colors.foreground} />
      </View>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowLabel} numberOfLines={1}>
          {title}
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
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.secondary,
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
