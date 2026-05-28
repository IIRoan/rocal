import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import type { Calendar, CalendarSubscription } from "@workspace/calendar-core";
import { getErrorMessage } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { StackScreenHeader } from "../../src/components/StackScreenHeader";
import { useTheme } from "../../src/providers/ThemeProvider";
import { calendarApiService } from "../../src/lib/api";
import { QUERY_KEYS } from "../../src/lib/query-keys";
import {
  formatLastSync,
  getSubscriptionType,
  sortSubscriptions,
} from "../../src/lib/subscription-utils";
import {
  SectionHeader,
  EmptyCard,
} from "../../src/components/ui/list-components";

type ReadOnlyCalendarEntry = {
  subscription: CalendarSubscription;
  calendar: Calendar | undefined;
};

export default function SubscriptionListScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { push } = useRouter();
  const queryClient = useQueryClient();

  const {
    data: subscriptions = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: QUERY_KEYS.subscriptions(),
    queryFn: () => calendarApiService.getSubscriptions(),
  });

  const { data: calendars = [] } = useQuery({
    queryKey: QUERY_KEYS.calendars(),
    queryFn: () => calendarApiService.getCalendars(),
    staleTime: 5 * 60 * 1000,
  });

  const [pendingVisibilityCalendarId, setPendingVisibilityCalendarId] =
    useState<string | null>(null);
  const [pendingSyncSubscriptionId, setPendingSyncSubscriptionId] = useState<
    string | null
  >(null);

  const calendarById = useMemo(
    () => new Map(calendars.map((calendar) => [calendar.id, calendar])),
    [calendars],
  );

  const sortedSubscriptions = useMemo(
    () => sortSubscriptions(subscriptions),
    [subscriptions],
  );

  const holidayCalendars = useMemo(
    () =>
      sortedSubscriptions.flatMap((subscription) =>
        getSubscriptionType(subscription) === "holiday"
          ? [{ subscription, calendar: calendarById.get(subscription.calendar.id) }]
          : [],
      ),
    [calendarById, sortedSubscriptions],
  );

  const externalFeeds = useMemo(
    () =>
      sortedSubscriptions.flatMap((subscription) =>
        getSubscriptionType(subscription) === "external"
          ? [{ subscription, calendar: calendarById.get(subscription.calendar.id) }]
          : [],
      ),
    [calendarById, sortedSubscriptions],
  );

  const toggleVisibilityMutation = useMutation({
    mutationFn: ({
      calendarId,
      isVisible,
    }: {
      calendarId: string;
      isVisible: boolean;
    }) => calendarApiService.updateCalendar(calendarId, { isVisible }),
    onMutate: ({ calendarId }) => {
      setPendingVisibilityCalendarId(calendarId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.calendars() });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (mutationError) => {
      Alert.alert(
        "Unable to update visibility",
        getErrorMessage(mutationError, "Failed to update calendar visibility"),
      );
    },
    onSettled: () => {
      setPendingVisibilityCalendarId(null);
    },
  });

  const syncSubscriptionMutation = useMutation({
    mutationFn: (subscriptionId: string) =>
      calendarApiService.syncSubscription(subscriptionId),
    onMutate: (subscriptionId) => {
      setPendingSyncSubscriptionId(subscriptionId);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.subscriptions() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.calendars() });
      queryClient.invalidateQueries({ queryKey: ["events"] });

      if (result.status === "error") {
        Alert.alert(
          "Sync finished with issues",
          result.message ??
            result.errors?.join("\n") ??
            "The calendar feed returned an error.",
        );
      }
    },
    onError: (mutationError) => {
      Alert.alert(
        "Unable to sync calendar",
        getErrorMessage(mutationError, "Failed to sync calendar"),
      );
    },
    onSettled: () => {
      setPendingSyncSubscriptionId(null);
    },
  });

  const handleOpenCreate = useCallback(() => {
    push("/subscription/create");
  }, [push]);

  const handleOpenEdit = useCallback(
    (subscription: CalendarSubscription) => {
      push(`/subscription/edit/${subscription.id}`);
    },
    [push],
  );

  const handleToggleVisibility = useCallback(
    (entry: ReadOnlyCalendarEntry) => {
      if (!entry.calendar) {
        Alert.alert(
          "Calendar unavailable",
          "This subscription is still loading. Try again in a moment.",
        );
        return;
      }

      toggleVisibilityMutation.mutate({
        calendarId: entry.calendar.id,
        isVisible: !entry.calendar.isVisible,
      });
    },
    [toggleVisibilityMutation],
  );

  const handleSync = useCallback(
    (subscriptionId: string) => {
      syncSubscriptionMutation.mutate(subscriptionId);
    },
    [syncSubscriptionMutation],
  );

  if (isLoading && subscriptions.length === 0) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primaryBase} />
        <Text style={styles.loadingText}>Loading read-only calendars…</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>
          {getErrorMessage(error, "Failed to load read-only calendars")}
        </Text>
        <Pressable style={styles.primaryButton} onPress={handleOpenCreate}>
          <Text style={styles.primaryButtonText}>Add Calendar</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StackScreenHeader
        title="Read-only Calendars"
        rightAction={
          <Pressable
            style={styles.headerAction}
            onPress={handleOpenCreate}
            accessibilityRole="button"
            accessibilityLabel="Add read-only calendar"
          >
            <Feather name="plus" size={18} color={theme.colors.primaryBase} />
          </Pressable>
        }
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroIconWrap}>
            <Feather name="rss" size={20} color={theme.colors.primaryBase} />
          </View>
          <View style={styles.heroBody}>
            <Text style={styles.heroTitle}>
              External feeds, holidays, and imports
            </Text>
            <Text style={styles.heroText}>
              Read-only calendars stay separate from your editable calendars and
              can be hidden, synced, or removed at any time.
            </Text>
          </View>
          <Pressable style={styles.primaryButton} onPress={handleOpenCreate}>
            <Text style={styles.primaryButtonText}>Add or Import</Text>
          </Pressable>
        </View>

        <SectionHeader
          title="Holiday Calendars"
          count={holidayCalendars.length}
          theme={theme}
        />
        {holidayCalendars.length === 0 ? (
          <EmptyCard
            icon="globe"
            title="No holiday calendars yet"
            text="Browse the holiday catalog to add national calendars in one tap."
            theme={theme}
          />
        ) : (
          holidayCalendars.map((entry) => (
            <ReadOnlyCalendarRow
              key={entry.subscription.id}
              entry={entry}
              onOpen={() => handleOpenEdit(entry.subscription)}
              onToggleVisibility={() => handleToggleVisibility(entry)}
              visibilityPending={
                pendingVisibilityCalendarId === entry.subscription.calendar.id
              }
              theme={theme}
            />
          ))
        )}

        <SectionHeader
          title="External Feeds"
          count={externalFeeds.length}
          theme={theme}
        />
        {externalFeeds.length === 0 ? (
          <EmptyCard
            icon="link-2"
            title="No external feeds yet"
            text="Add an .ics URL to keep a third-party calendar synced in the background."
            theme={theme}
          />
        ) : (
          externalFeeds.map((entry) => (
            <ReadOnlyCalendarRow
              key={entry.subscription.id}
              entry={entry}
              onOpen={() => handleOpenEdit(entry.subscription)}
              onToggleVisibility={() => handleToggleVisibility(entry)}
              onSync={() => handleSync(entry.subscription.id)}
              visibilityPending={
                pendingVisibilityCalendarId === entry.subscription.calendar.id
              }
              syncPending={pendingSyncSubscriptionId === entry.subscription.id}
              theme={theme}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ReadOnlyCalendarRow({
  entry,
  onOpen,
  onToggleVisibility,
  onSync,
  visibilityPending = false,
  syncPending = false,
  theme,
}: {
  entry: ReadOnlyCalendarEntry;
  onOpen: () => void;
  onToggleVisibility: () => void;
  onSync?: () => void;
  visibilityPending?: boolean;
  syncPending?: boolean;
  theme: ThemeTokens;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const kind = getSubscriptionType(entry.subscription);
  const isVisible = entry.calendar?.isVisible ?? true;
  const metaParts = [kind === "holiday" ? "Holiday calendar" : "External feed"];

  if (!isVisible) {
    metaParts.push("Hidden");
  }

  if (kind === "external") {
    metaParts.push(
      `Last synced ${formatLastSync(entry.subscription.lastSyncAt).toLowerCase()}`,
    );
  }

  return (
    <View style={styles.rowCard}>
      <Pressable style={styles.rowInfoButton} onPress={onOpen}>
        <View
          style={[
            styles.colorSwatch,
            {
              backgroundColor:
                entry.subscription.calendar.color || theme.colors.primaryBase,
            },
          ]}
        />
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {entry.subscription.calendar.name}
          </Text>
          <Text style={styles.rowMeta}>{metaParts.join(" · ")}</Text>
          {kind === "external" && entry.subscription.lastErrorMessage ? (
            <Text style={styles.rowError} numberOfLines={1}>
              {entry.subscription.lastErrorMessage}
            </Text>
          ) : null}
        </View>
      </Pressable>

      <View style={styles.rowActions}>
        <RoundIconButton
          icon={isVisible ? "eye" : "eye-off"}
          onPress={onToggleVisibility}
          pending={visibilityPending}
          accessibilityLabel={isVisible ? "Hide calendar" : "Show calendar"}
          theme={theme}
        />
        {kind === "external" && onSync ? (
          <RoundIconButton
            icon="refresh-cw"
            onPress={onSync}
            pending={syncPending}
            accessibilityLabel="Sync now"
            theme={theme}
          />
        ) : null}
        <RoundIconButton
          icon="chevron-right"
          onPress={onOpen}
          accessibilityLabel="Open calendar details"
          theme={theme}
        />
      </View>
    </View>
  );
}

function RoundIconButton({
  icon,
  onPress,
  accessibilityLabel,
  pending = false,
  theme,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  onPress: () => void;
  accessibilityLabel: string;
  pending?: boolean;
  theme: ThemeTokens;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Pressable
      style={styles.iconButton}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {pending ? (
        <ActivityIndicator size="small" color={theme.colors.primaryBase} />
      ) : (
        <Feather name={icon} size={15} color={theme.colors.mutedForeground} />
      )}
    </Pressable>
  );
}

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
      gap: theme.spacing["3"],
    },
    headerAction: {
      width: 38,
      height: 38,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: theme.spacing["4"],
      paddingBottom: theme.spacing["8"],
      gap: theme.spacing["3"],
    },
    heroCard: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.card,
      padding: theme.spacing["4"],
      gap: theme.spacing["3"],
    },
    heroIconWrap: {
      width: 40,
      height: 40,
      borderRadius: theme.borderRadius.full,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: theme.colors.primaryBase + "14",
    },
    heroBody: {
      gap: theme.spacing["1"],
    },
    primaryButton: {
      alignSelf: "flex-start" as const,
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.primaryBase,
    },
    rowCard: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["3"],
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.card,
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["3"],
    },
    rowInfoButton: {
      flex: 1,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["3"],
    },
    colorSwatch: {
      width: 14,
      height: 14,
      borderRadius: theme.borderRadius.full,
      flexShrink: 0,
    },
    rowCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    rowActions: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
    },
    iconButton: {
      width: 34,
      height: 34,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.muted,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    loadingText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
    errorText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.destructive,
      textAlign: "center" as const,
    },
    heroTitle: {
      fontSize: theme.typography.fontSize.lg.size,
      lineHeight: theme.typography.fontSize.lg.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    heroText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
    primaryButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.primaryForeground,
    },
    rowTitle: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    rowMeta: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    },
    rowError: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.destructive,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
