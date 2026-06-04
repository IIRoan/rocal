import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import type { Calendar, CalendarSubscription } from "@workspace/calendar-core";
import {
  getErrorMessage,
  partitionCalendarsByKind,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../src/providers/ThemeProvider";
import { useToast } from "../../src/providers/ToastProvider";
import { calendarApiService } from "../../src/lib/api";
import { QUERY_KEYS } from "../../src/lib/query-keys";
import { StackScreenHeader } from "../../src/components/StackScreenHeader";
import {
  formatLastSync,
  getSubscriptionType,
  resolveCalendarSwatchColor,
  sortSubscriptions,
} from "../../src/lib/subscription-utils";
import {
  SectionHeader,
  EmptyCard,
} from "../../src/components/ui/list-components";
import { LoadingScreen, InlineLoader } from "../../src/components/ui/loading";

type ReadOnlyCalendarEntry = {
  subscription: CalendarSubscription;
  calendar: Calendar | undefined;
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function CalendarManageScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { push, back } = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

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

  const { data: subscriptions = [], isLoading: subscriptionsLoading } =
    useQuery({
      queryKey: QUERY_KEYS.subscriptions(),
      queryFn: () => calendarApiService.getSubscriptions(),
    });

  const { ownedCalendars } = useMemo(
    () => partitionCalendarsByKind(calendars ?? []),
    [calendars],
  );

  const sortedOwnedCalendars = useMemo(
    () =>
      [...ownedCalendars].sort((left, right) => {
        if (left.isDefault !== right.isDefault) {
          return left.isDefault ? -1 : 1;
        }

        return left.name.localeCompare(right.name);
      }),
    [ownedCalendars],
  );

  const calendarById = useMemo(
    () => new Map((calendars ?? []).map((calendar) => [calendar.id, calendar])),
    [calendars],
  );

  const readOnlyCalendars = useMemo(
    () =>
      sortSubscriptions(subscriptions).map((subscription) => ({
        subscription,
        calendar: calendarById.get(subscription.calendar.id),
      })),
    [calendarById, subscriptions],
  );

  // ─── Visibility toggle mutation ────────────────────────────────────────────

  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [pendingDefaultCalendarId, setPendingDefaultCalendarId] = useState<
    string | null
  >(null);
  const [pendingSyncSubscriptionId, setPendingSyncSubscriptionId] = useState<
    string | null
  >(null);

  const toggleVisibilityMutation = useMutation({
    mutationFn: ({ id, isVisible }: { id: string; isVisible: boolean }) =>
      calendarApiService.updateCalendar(id, { isVisible }),
    onMutate: ({ id }) => {
      setTogglingIds((prev) => new Set(prev).add(id));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.calendars() });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (mutationError) => {
      toast(
        getErrorMessage(mutationError, "Failed to update calendar visibility"),
        "error",
      );
    },
    onSettled: (_data, _error, { id }) => {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
  });

  const setDefaultCalendarMutation = useMutation({
    mutationFn: (calendarId: string) =>
      calendarApiService.updateCalendar(calendarId, { isDefault: true }),
    onMutate: (calendarId) => {
      setPendingDefaultCalendarId(calendarId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.calendars() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings() });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast("Default calendar updated");
    },
    onError: (mutationError) => {
      toast(
        getErrorMessage(mutationError, "Failed to update default calendar"),
        "error",
      );
    },
    onSettled: () => {
      setPendingDefaultCalendarId(null);
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
        toast(
          result.message ??
            result.errors?.join("\n") ??
            "The calendar feed returned an error.",
          "error",
        );
      } else {
        toast("Calendar synced");
      }
    },
    onError: (mutationError) => {
      toast(getErrorMessage(mutationError, "Failed to sync calendar"), "error");
    },
    onSettled: () => {
      setPendingSyncSubscriptionId(null);
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
      push(`/calendar-manage/edit/${calendar.id}`);
    },
    [push],
  );

  const handleReadOnlyPress = useCallback(
    (subscription: CalendarSubscription) => {
      push(`/subscription/edit/${subscription.id}`);
    },
    [push],
  );

  const handleCreate = useCallback(() => {
    push("/calendar-manage/create");
  }, [push]);

  const handleOpenSubscriptions = useCallback(() => {
    push("/subscription");
  }, [push]);

  const handleAddOrImport = useCallback(() => {
    push("/subscription/create");
  }, [push]);

  const handleSetDefault = useCallback(
    (calendarId: string) => {
      setDefaultCalendarMutation.mutate(calendarId);
    },
    [setDefaultCalendarMutation],
  );

  const handleSyncSubscription = useCallback(
    (subscriptionId: string) => {
      syncSubscriptionMutation.mutate(subscriptionId);
    },
    [syncSubscriptionMutation],
  );

  // ─── Render item ───────────────────────────────────────────────────────────

  // ─── Loading state ─────────────────────────────────────────────────────────

  if (isLoading) {
    return <LoadingScreen theme={theme} message="Loading calendars…" />;
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
          onPress={() => back()}
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
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StackScreenHeader
        title="Calendar Management"
        rightAction={
          <Pressable
            style={styles.headerAction}
            onPress={handleCreate}
            accessibilityRole="button"
            accessibilityLabel="Create new calendar"
          >
            <Feather name="plus" size={18} color={theme.colors.primaryBase} />
          </Pressable>
        }
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <SectionHeader
          title="Owned Calendars"
          count={sortedOwnedCalendars.length}
          actionLabel="New"
          onAction={handleCreate}
          theme={theme}
        />
        {sortedOwnedCalendars.length === 0 ? (
          <EmptyCard
            icon="calendar"
            title="No owned calendars yet"
            text="Create a calendar to organize events, share it, and choose a default."
            theme={theme}
          />
        ) : (
          sortedOwnedCalendars.map((calendar) => (
            <OwnedCalendarRow
              key={calendar.id}
              calendar={calendar}
              onOpen={() => handleCalendarPress(calendar)}
              onToggleVisibility={() => handleToggleVisibility(calendar)}
              onSetDefault={() => handleSetDefault(calendar.id)}
              visibilityPending={togglingIds.has(calendar.id)}
              defaultPending={pendingDefaultCalendarId === calendar.id}
              theme={theme}
            />
          ))
        )}

        <SectionHeader
          title="Read-only Calendars"
          count={readOnlyCalendars.length}
          actionLabel="Manage"
          onAction={handleOpenSubscriptions}
          theme={theme}
        />
        {subscriptionsLoading ? (
          <InlineLoader theme={theme} message="Loading subscriptions…" />
        ) : readOnlyCalendars.length === 0 ? (
          <EmptyCard
            icon="rss"
            title="No read-only calendars yet"
            text="Add an external feed, import a local .ics file, or browse holiday calendars."
            theme={theme}
          />
        ) : (
          readOnlyCalendars.map((entry) => (
            <ReadOnlyCalendarRow
              key={entry.subscription.id}
              entry={entry}
              onOpen={() => handleReadOnlyPress(entry.subscription)}
              onToggleVisibility={() =>
                entry.calendar
                  ? handleToggleVisibility(entry.calendar)
                  : undefined
              }
              onSync={
                getSubscriptionType(entry.subscription) === "external"
                  ? () => handleSyncSubscription(entry.subscription.id)
                  : undefined
              }
              visibilityPending={togglingIds.has(
                entry.subscription.calendar.id,
              )}
              syncPending={pendingSyncSubscriptionId === entry.subscription.id}
              theme={theme}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function OwnedCalendarRow({
  calendar,
  onOpen,
  onToggleVisibility,
  onSetDefault,
  visibilityPending,
  defaultPending,
  theme,
}: {
  calendar: Calendar;
  onOpen: () => void;
  onToggleVisibility: () => void;
  onSetDefault: () => void;
  visibilityPending: boolean;
  defaultPending: boolean;
  theme: ThemeTokens;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const meta = [calendar.isDefault ? "Default" : "Owned"];

  if (calendar.forceFullEncryption) {
    meta.push("Encrypted");
  }
  if (!calendar.isVisible) {
    meta.push("Hidden");
  }

  return (
    <View style={styles.rowCard}>
      <Pressable style={styles.rowInfoButton} onPress={onOpen}>
        <View
          style={[
            styles.colorSwatch,
            {
              backgroundColor: resolveCalendarSwatchColor(
                calendar.color,
                theme,
              ),
            },
          ]}
        />
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {calendar.name}
          </Text>
          <Text style={styles.rowMeta}>{meta.join(" · ")}</Text>
        </View>
      </Pressable>

      <View style={styles.rowActions}>
        {!calendar.isDefault ? (
          <RoundIconButton
            icon="star"
            onPress={onSetDefault}
            pending={defaultPending}
            accessibilityLabel="Set as default calendar"
            theme={theme}
          />
        ) : null}
        <RoundIconButton
          icon={calendar.isVisible ? "eye" : "eye-off"}
          onPress={onToggleVisibility}
          pending={visibilityPending}
          accessibilityLabel={
            calendar.isVisible ? "Hide calendar" : "Show calendar"
          }
          theme={theme}
        />
        <RoundIconButton
          icon="chevron-right"
          onPress={onOpen}
          accessibilityLabel="Open calendar details"
          pending={false}
          theme={theme}
        />
      </View>
    </View>
  );
}

function ReadOnlyCalendarRow({
  entry,
  onOpen,
  onToggleVisibility,
  onSync,
  visibilityPending,
  syncPending,
  theme,
}: {
  entry: ReadOnlyCalendarEntry;
  onOpen: () => void;
  onToggleVisibility: () => void;
  onSync?: () => void;
  visibilityPending: boolean;
  syncPending: boolean;
  theme: ThemeTokens;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const type = getSubscriptionType(entry.subscription);
  const meta = [type === "holiday" ? "Holiday calendar" : "External feed"];

  if (entry.calendar && !entry.calendar.isVisible) {
    meta.push("Hidden");
  }
  if (type === "external") {
    meta.push(
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
              backgroundColor: resolveCalendarSwatchColor(
                entry.subscription.calendar.color,
                theme,
              ),
            },
          ]}
        />
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {entry.subscription.calendar.name}
          </Text>
          <Text style={styles.rowMeta}>{meta.join(" · ")}</Text>
        </View>
      </Pressable>

      <View style={styles.rowActions}>
        <RoundIconButton
          icon={entry.calendar?.isVisible === false ? "eye-off" : "eye"}
          onPress={onToggleVisibility}
          pending={visibilityPending}
          accessibilityLabel={
            entry.calendar?.isVisible === false
              ? "Show calendar"
              : "Hide calendar"
          }
          theme={theme}
        />
        {onSync ? (
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
          accessibilityLabel="Open read-only calendar details"
          pending={false}
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
  pending,
  theme,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  onPress: () => void;
  accessibilityLabel: string;
  pending: boolean;
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
    backButton: {
      minHeight: 44,
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.primaryBase,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      paddingHorizontal: theme.spacing["4"],
      marginTop: theme.spacing["3"],
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
    rowTitle: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    rowMeta: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
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
      color: theme.colors.primaryForeground,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
