import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import type {
  CalendarEvent,
  RecurrenceDeleteScope,
  RecurrenceEditScope,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../src/providers/ThemeProvider";
import { calendarApiService } from "../../src/lib/api";
import { QUERY_KEYS } from "../../src/lib/query-keys";
import {
  formatEventDate,
  formatEventTime,
  formatReminderLabel,
} from "../../src/components/event/event-detail-utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type ScopeAction = "edit" | "delete";

const SCOPE_OPTIONS: {
  label: string;
  scope: RecurrenceEditScope & RecurrenceDeleteScope;
}[] = [
  { label: "This occurrence", scope: "this_only" },
  { label: "This and future", scope: "this_and_future" },
  { label: "All occurrences", scope: "all" },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const queryClient = useQueryClient();

  // ─── State ─────────────────────────────────────────────────────────────────

  const [scopeModalVisible, setScopeModalVisible] = useState(false);
  const [scopeAction, setScopeAction] = useState<ScopeAction>("edit");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ─── Data fetching ─────────────────────────────────────────────────────────

  const {
    data: event,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: QUERY_KEYS.eventDetail(id ?? ""),
    queryFn: () => calendarApiService.getEvent(id!),
    enabled: !!id,
  });

  // ─── Delete mutation ───────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: async ({
      scope,
      occurrenceDate,
    }: {
      scope?: RecurrenceDeleteScope;
      occurrenceDate?: string;
    }) => {
      if (scope) {
        return calendarApiService.deleteRecurringEvent(
          id!,
          scope,
          occurrenceDate,
        );
      }
      return calendarApiService.deleteEvent(id!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.eventDetail(id!) });
      router.back();
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Failed to delete event";
      setDeleteError(message);
    },
  });

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const isRecurring = !!(event?.recurrence || event?.parentEventId);

  const handleEdit = useCallback(() => {
    if (isRecurring) {
      setScopeAction("edit");
      setScopeModalVisible(true);
    } else {
      router.push(`/event/edit/${id}`);
    }
  }, [isRecurring, id, router]);

  const handleDelete = useCallback(() => {
    if (isRecurring) {
      setScopeAction("delete");
      setScopeModalVisible(true);
    } else {
      Alert.alert("Delete event?", "This action cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate({}),
        },
      ]);
    }
  }, [isRecurring, deleteMutation]);

  const handleScopeSelect = useCallback(
    (scope: RecurrenceEditScope & RecurrenceDeleteScope) => {
      setScopeModalVisible(false);
      const occurrenceDate = event?.start
        ? new Date(event.start).toISOString()
        : undefined;

      if (scopeAction === "edit") {
        router.push(
          `/event/edit/${id}?scope=${scope}${occurrenceDate ? `&occurrenceDate=${occurrenceDate}` : ""}`,
        );
      } else {
        Alert.alert(
          "Delete event?",
          "This action cannot be undone.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: () =>
                deleteMutation.mutate({ scope, occurrenceDate }),
            },
          ],
        );
      }
    },
    [scopeAction, event, id, router, deleteMutation],
  );

  // ─── Loading state ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primaryBase} />
      </SafeAreaView>
    );
  }

  // ─── Error state ───────────────────────────────────────────────────────────

  if (isError || !event) {
    const errorMessage =
      error && typeof error === "object" && "message" in error
        ? (error as { message: string }).message
        : "Failed to load event";
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

  const calendarColor = event.calendar?.color ?? theme.colors.primaryBase;
  const categoryColor = event.category?.color;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Title */}
        <Text style={styles.title} accessibilityRole="header">
          {event.title}
        </Text>

        {/* Date & Time */}
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Date</Text>
          <Text style={styles.detailValue}>{formatEventDate(event)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Time</Text>
          <Text style={styles.detailValue}>{formatEventTime(event)}</Text>
        </View>

        {/* Calendar */}
        {event.calendar && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Calendar</Text>
            <View style={styles.tagRow}>
              <View
                style={[
                  styles.colorDot,
                  { backgroundColor: calendarColor },
                ]}
              />
              <Text style={styles.detailValue}>{event.calendar.name}</Text>
            </View>
          </View>
        )}

        {/* Category */}
        {event.category && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Category</Text>
            <View style={styles.tagRow}>
              {categoryColor ? (
                <View
                  style={[
                    styles.colorDot,
                    { backgroundColor: categoryColor },
                  ]}
                />
              ) : null}
              <Text style={styles.detailValue}>{event.category.name}</Text>
            </View>
          </View>
        )}

        {/* Location */}
        {event.location ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Location</Text>
            <Text style={styles.detailValue}>{event.location}</Text>
          </View>
        ) : null}

        {/* Description */}
        {event.description ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Description</Text>
            <Text style={styles.descriptionText}>{event.description}</Text>
          </View>
        ) : null}

        {/* Recurrence */}
        {event.recurrence ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Repeats</Text>
            <Text style={styles.detailValue}>{event.recurrence}</Text>
          </View>
        ) : null}

        {/* Reminder */}
        {event.reminder != null && event.reminder >= 0 ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Reminder</Text>
            <Text style={styles.detailValue}>
              {formatReminderLabel(event.reminder)}
            </Text>
          </View>
        ) : null}

        {/* Delete error */}
        {deleteError ? (
          <Text style={styles.deleteErrorText}>{deleteError}</Text>
        ) : null}

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <Pressable
            style={styles.editButton}
            onPress={handleEdit}
            accessibilityRole="button"
            accessibilityLabel="Edit event"
          >
            <Text style={styles.editButtonText}>Edit</Text>
          </Pressable>
          <Pressable
            style={styles.deleteButton}
            onPress={handleDelete}
            disabled={deleteMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel="Delete event"
          >
            {deleteMutation.isPending ? (
              <ActivityIndicator size="small" color={theme.colors.destructiveForeground} />
            ) : (
              <Text style={styles.deleteButtonText}>Delete</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>

      {/* Scope picker modal for recurring events */}
      <Modal
        visible={scopeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setScopeModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setScopeModalVisible(false)}
        >
          <View
            style={styles.modalContent}
            onStartShouldSetResponder={() => true}
          >
            <Text style={styles.modalTitle}>
              {scopeAction === "edit"
                ? "Edit recurring event"
                : "Delete recurring event"}
            </Text>
            {SCOPE_OPTIONS.map((option) => (
              <Pressable
                key={option.scope}
                style={styles.scopeOption}
                onPress={() => handleScopeSelect(option.scope)}
                accessibilityRole="button"
                accessibilityLabel={option.label}
              >
                <Text style={styles.scopeOptionText}>{option.label}</Text>
              </Pressable>
            ))}
            <Pressable
              style={styles.cancelOption}
              onPress={() => setScopeModalVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.cancelOptionText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
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
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: theme.spacing["4"],
      paddingBottom: theme.spacing["8"],
    },
    detailRow: {
      marginBottom: theme.spacing["3"],
    },
    tagRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
    },
    colorDot: {
      width: 10,
      height: 10,
      borderRadius: theme.borderRadius.full,
      marginRight: theme.spacing["1"],
    },
    actionRow: {
      flexDirection: "row" as const,
      gap: theme.spacing["3"],
      marginTop: theme.spacing["6"],
    },
    editButton: {
      flex: 1,
      backgroundColor: theme.colors.primaryBase,
      paddingVertical: theme.spacing["3"],
      borderRadius: theme.borderRadius.md,
      alignItems: "center" as const,
    },
    deleteButton: {
      flex: 1,
      backgroundColor: theme.colors.destructive,
      paddingVertical: theme.spacing["3"],
      borderRadius: theme.borderRadius.md,
      alignItems: "center" as const,
    },
    backButton: {
      marginTop: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      paddingHorizontal: theme.spacing["4"],
      backgroundColor: theme.colors.muted,
      borderRadius: theme.borderRadius.md,
    },
    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center" as const,
      alignItems: "center" as const,
    },
    modalContent: {
      width: "85%" as unknown as number,
      backgroundColor: theme.colors.card,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing["4"],
    },
    scopeOption: {
      paddingVertical: theme.spacing["3"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    cancelOption: {
      paddingVertical: theme.spacing["3"],
      alignItems: "center" as const,
      marginTop: theme.spacing["2"],
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    title: {
      fontSize: theme.typography.fontSize["2xl"].size,
      lineHeight: theme.typography.fontSize["2xl"].lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
      marginBottom: theme.spacing["4"],
    },
    detailLabel: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
      marginBottom: 2,
    },
    detailValue: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.foreground,
    },
    descriptionText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    errorText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.destructive,
      textAlign: "center" as const,
    },
    deleteErrorText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.destructive,
      marginTop: theme.spacing["2"],
      textAlign: "center" as const,
    },
    editButtonText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
      color: theme.colors.primaryForeground,
    },
    deleteButtonText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
      color: theme.colors.destructiveForeground,
    },
    backButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    modalTitle: {
      fontSize: theme.typography.fontSize.lg.size,
      lineHeight: theme.typography.fontSize.lg.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
      marginBottom: theme.spacing["3"],
    },
    scopeOptionText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.foreground,
    },
    cancelOptionText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
