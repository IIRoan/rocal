import React, { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { CalendarView } from "@workspace/calendar-core";
import { resolveTimezone } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { useAuth } from "../../providers/AuthProvider";
import { useCalendarView } from "../../providers/CalendarViewProvider";
import { calendarApiService } from "../../lib/api";
import { QUERY_KEYS } from "../../lib/query-keys";
import type { AppSwitchKey } from "../../lib/app-switcher-config";
import { useWorkspaceTabSwitch } from "../../lib/use-workspace-tab-switch";
import { useDeferredSheetAction } from "../../hooks/use-deferred-sheet-action";
import { useToggleCalendarVisibility } from "../../hooks/use-toggle-calendar-visibility";
import { BottomSheet, BottomSheetScrollView } from "../BottomSheet";
import { WorkspaceAppSwitch } from "../WorkspaceAppSwitch";
import { SidebarMiniCalendar } from "../SidebarMiniCalendar";
import { buildSidebarCalendarSections } from "../app-sidebar-utils";
import { InlineLoader } from "../ui/loading";
import { CalendarViewToggle } from "./CalendarViewToggle";

interface CalendarDrawerSheetProps {
  visible: boolean;
  onDismiss: () => void;
}

/** Calendar drawer: app switch, mini month, view picker, and calendar visibility. */
export function CalendarDrawerSheet({ visible, onDismiss }: CalendarDrawerSheetProps) {
  const { theme } = useTheme();
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const switchTab = useWorkspaceTabSwitch();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { activeView, selectedDate, setActiveView, setCurrentDate, setSelectedDate } =
    useCalendarView();
  const { runAfterClose, onCloseComplete } = useDeferredSheetAction(onDismiss);
  const { toggle: toggleVisibility, pendingCalendarId } = useToggleCalendarVisibility();

  const { data: calendars = [], isLoading: calendarsLoading } = useQuery({
    queryKey: QUERY_KEYS.calendars(),
    queryFn: () => calendarApiService.getCalendars(),
    enabled: isAuthenticated,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });

  const { data: settings } = useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
    enabled: isAuthenticated,
  });
  const resolvedTimezone = resolveTimezone(settings?.timezone);

  const calendarSections = useMemo(
    () => buildSidebarCalendarSections(calendars, theme),
    [calendars, theme],
  );
  const calendarById = useMemo(
    () => new Map(calendars.map((calendar) => [calendar.id, calendar])),
    [calendars],
  );

  const navigate = useCallback(
    (route: string) => runAfterClose(() => router.push(route as never)),
    [router, runAfterClose],
  );

  const handleSwitchApp = useCallback(
    (app: AppSwitchKey) => runAfterClose(() => switchTab(app)),
    [runAfterClose, switchTab],
  );

  const handleDayPress = useCallback(
    (date: Date) => {
      setCurrentDate(date);
      setSelectedDate(date);
      onDismiss();
    },
    [onDismiss, setCurrentDate, setSelectedDate],
  );

  const handleViewChange = useCallback(
    (view: CalendarView) => {
      setActiveView(view);
      onDismiss();
    },
    [onDismiss, setActiveView],
  );

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      onCloseComplete={onCloseComplete}
      snapPoints={[0.92]}
    >
      <BottomSheetScrollView contentContainerStyle={styles.content}>
        <WorkspaceAppSwitch activeApp="calendar" onSwitch={handleSwitchApp} />

        <SidebarMiniCalendar
          weekStartDay={settings?.weekStartDay ?? 1}
          selectedDate={selectedDate}
          timezone={resolvedTimezone}
          onDayPress={handleDayPress}
        />

        <Pressable
          onPress={() => navigate("/event/create")}
          style={({ pressed }) => [styles.newEvent, pressed && styles.rowPressed]}
          accessibilityRole="button"
          accessibilityLabel="Create new event"
        >
          <Feather name="plus" size={15} color={theme.colors.foreground} />
          <Text style={styles.newEventText}>New event</Text>
        </Pressable>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>View</Text>
          <CalendarViewToggle activeView={activeView} onViewChange={handleViewChange} />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Calendars</Text>
            <View style={styles.sectionActions}>
              <Pressable
                onPress={() => navigate("/calendar-manage/create")}
                style={({ pressed }) => [styles.sectionAction, pressed && styles.rowPressed]}
                accessibilityRole="button"
                accessibilityLabel="Create calendar"
              >
                <Feather name="plus" size={16} color={theme.colors.mutedForeground} />
              </Pressable>
              <Pressable
                onPress={() => navigate("/calendar-manage")}
                style={({ pressed }) => [styles.sectionAction, pressed && styles.rowPressed]}
                accessibilityRole="button"
                accessibilityLabel="Manage calendars"
              >
                <Feather name="sliders" size={15} color={theme.colors.mutedForeground} />
              </Pressable>
            </View>
          </View>

          {calendarsLoading ? (
            <InlineLoader theme={theme} />
          ) : calendars.length === 0 ? (
            <Text style={styles.emptyText}>No calendars yet. Tap + to create one.</Text>
          ) : (
            calendarSections.map((section) => (
              <View key={section.key}>
                {section.title ? (
                  <Text style={styles.sectionSeparator}>{section.title}</Text>
                ) : null}
                {section.rows.map((row) => {
                  const calendar = calendarById.get(row.id);
                  return (
                    <Pressable
                      key={row.id}
                      onPress={() => calendar && toggleVisibility(calendar)}
                      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                      accessibilityRole="button"
                      accessibilityLabel={`${row.isVisible ? "Hide" : "Show"} ${row.name}`}
                      accessibilityState={{ checked: row.isVisible }}
                    >
                      {pendingCalendarId === row.id ? (
                        <ActivityIndicator
                          size="small"
                          color={theme.colors.mutedForeground}
                          style={styles.dotPlaceholder}
                        />
                      ) : (
                        <View
                          style={[
                            styles.dot,
                            { backgroundColor: row.swatchColor },
                            !row.isVisible && styles.dotHidden,
                          ]}
                        />
                      )}
                      <Text
                        style={[styles.rowLabel, !row.isVisible && styles.rowLabelHidden]}
                        numberOfLines={1}
                      >
                        {row.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))
          )}
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    content: {
      paddingHorizontal: theme.spacing["4"],
      paddingBottom: theme.spacing["10"],
      gap: theme.spacing["4"],
    },
    newEvent: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: theme.spacing["2"],
      height: 40,
      borderRadius: theme.borderRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    section: {
      gap: theme.spacing["1"],
    },
    sectionHeader: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
    },
    sectionActions: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      marginRight: -theme.spacing["2"],
    },
    sectionAction: {
      width: 44,
      height: 44,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderRadius: theme.borderRadius.md,
    },
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["3"],
      minHeight: 44,
      paddingHorizontal: theme.spacing["1"],
      borderRadius: theme.borderRadius.md,
    },
    rowPressed: {
      backgroundColor: theme.colors.foreground + "0f",
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: theme.borderRadius.full,
    },
    dotHidden: {
      opacity: 0.3,
    },
    dotPlaceholder: {
      width: 8,
      height: 8,
      transform: [{ scale: 0.6 }],
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    newEventText: {
      fontSize: 15,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    sectionLabel: {
      fontSize: 14,
      lineHeight: 19,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
    },
    sectionSeparator: {
      marginTop: theme.spacing["2"],
      marginBottom: theme.spacing["1"],
      paddingHorizontal: theme.spacing["1"],
      fontSize: theme.typography.fontSize.xs.size,
      color: theme.colors.mutedForeground,
    },
    rowLabel: {
      flex: 1,
      fontSize: 16,
      lineHeight: 21,
      color: theme.colors.foreground,
    },
    rowLabelHidden: {
      color: theme.colors.mutedForeground,
    },
    emptyText: {
      paddingHorizontal: theme.spacing["1"],
      fontSize: theme.typography.fontSize.xs.size,
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
