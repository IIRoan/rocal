import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Calendar } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../src/providers/ThemeProvider";
import { calendarApiService } from "../../src/lib/api";
import { QUERY_KEYS } from "../../src/lib/query-keys";

// ─── Component ───────────────────────────────────────────────────────────────

export default function CalendarManageScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const queryClient = useQueryClient();

  // ─── Data fetching ─────────────────────────────────────────────────────────

  const {
    data: calendars,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: QUERY_KEYS.calendars(),
    queryFn: () => calendarApiService.getCalendars(),
  });

  // ─── Visibility toggle mutation ────────────────────────────────────────────

  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  const toggleVisibilityMutation = useMutation({
    mutationFn: ({
      id,
      isVisible,
    }: {
      id: string;
      isVisible: boolean;
    }) => calendarApiService.updateCalendar(id, { isVisible }),
    onMutate: ({ id }) => {
      setTogglingIds((prev) => new Set(prev).add(id));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.calendars() });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onSettled: (_data, _error, { id }) => {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
  });

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleToggleVisibility = useCallback(
    (calendar: Calendar) => {
      toggleVisibilityMutation.mutate({
        id: calendar.id,
        isVisible: !calendar.isVisible,
      });
    },
    [toggleVisibilityMutation],
  );

  const handleCalendarPress = useCallback(
    (calendar: Calendar) => {
      router.push(`/calendar-manage/edit/${calendar.id}`);
    },
    [router],
  );

  const handleCreate = useCallback(() => {
    router.push("/calendar-manage/create");
  }, [router]);

  // ─── Render item ───────────────────────────────────────────────────────────

  const renderCalendarItem = useCallback(
    ({ item }: { item: Calendar }) => {
      const calendarColor =
        theme.colors.calendar[
          item.color as keyof typeof theme.colors.calendar
        ]?.bg ?? theme.colors.primaryBase;
      const isToggling = togglingIds.has(item.id);

      return (
        <Pressable
          style={styles.calendarRow}
          onPress={() => handleCalendarPress(item)}
          accessibilityRole="button"
          accessibilityLabel={`Edit calendar ${item.name}`}
        >
          <View
            style={[styles.colorDot, { backgroundColor: calendarColor }]}
          />
          <View style={styles.calendarInfo}>
            <Text style={styles.calendarName} numberOfLines={1}>
              {item.name}
            </Text>
            {item.isDefault ? (
              <Text style={styles.defaultBadge}>Default</Text>
            ) : null}
          </View>
          <Switch
            value={item.isVisible}
            onValueChange={() => handleToggleVisibility(item)}
            disabled={isToggling}
            trackColor={{
              false: theme.colors.muted,
              true: theme.colors.primaryBase,
            }}
            thumbColor={theme.colors.background}
            accessibilityLabel={`Toggle visibility for ${item.name}`}
          />
        </Pressable>
      );
    },
    [
      theme,
      styles,
      togglingIds,
      handleCalendarPress,
      handleToggleVisibility,
    ],
  );

  // ─── Loading state ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primaryBase} />
        <Text style={styles.loadingText}>Loading calendars…</Text>
      </SafeAreaView>
    );
  }

  // ─── Error state ───────────────────────────────────────────────────────────

  if (isError) {
    const errorMessage =
      error && typeof error === "object" && "message" in error
        ? (error as { message: string }).message
        : "Failed to load calendars";
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>{errorMessage}</Text>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backButtonText}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Manage Calendars
        </Text>
        <Pressable
          style={styles.createButton}
          onPress={handleCreate}
          accessibilityRole="button"
          accessibilityLabel="Create new calendar"
        >
          <Text style={styles.createButtonText}>+ New</Text>
        </Pressable>
      </View>
      <FlatList
        data={calendars ?? []}
        keyExtractor={(item) => item.id}
        renderItem={renderCalendarItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No calendars yet</Text>
            <Text style={styles.emptySubtext}>
              Tap "+ New" to create your first calendar
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    centered: {
      flex: 1,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      backgroundColor: theme.colors.background,
      padding: theme.spacing["4"],
    },
    header: {
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      alignItems: "center" as const,
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["3"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    listContent: {
      paddingVertical: theme.spacing["2"],
    },
    calendarRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["3"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    colorDot: {
      width: 14,
      height: 14,
      borderRadius: theme.borderRadius.full,
      marginRight: theme.spacing["3"],
    },
    calendarInfo: {
      flex: 1,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
    },
    createButton: {
      backgroundColor: theme.colors.primaryBase,
      paddingVertical: theme.spacing["1"],
      paddingHorizontal: theme.spacing["3"],
      borderRadius: theme.borderRadius.md,
    },
    backButton: {
      marginTop: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      paddingHorizontal: theme.spacing["4"],
      backgroundColor: theme.colors.muted,
      borderRadius: theme.borderRadius.md,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      paddingVertical: theme.spacing["12"],
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    headerTitle: {
      fontSize: theme.typography.fontSize["xl"].size,
      lineHeight: theme.typography.fontSize["xl"].lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    createButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
      color: theme.colors.primaryForeground,
    },
    calendarName: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.foreground,
      flexShrink: 1,
    },
    defaultBadge: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
    },
    loadingText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
      marginTop: theme.spacing["2"],
    },
    errorText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.destructive,
      textAlign: "center" as const,
    },
    backButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    emptyText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.foreground,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
    },
    emptySubtext: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
      marginTop: theme.spacing["1"],
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
