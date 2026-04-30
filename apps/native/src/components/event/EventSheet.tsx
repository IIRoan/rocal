import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CalendarEvent,
  CreateEventRequest,
  RecurrenceDeleteScope,
  RecurrenceEditScope,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { calendarApiService } from "../../lib/api";
import { QUERY_KEYS } from "../../lib/query-keys";
import { BottomSheet } from "../BottomSheet";
import { EventForm } from "./EventForm";
import { toLocalISOString } from "./event-form-utils";
import {
  formatEventDate,
  formatEventTime,
  formatReminderLabel,
} from "./event-detail-utils";

// ─── Types ───────────────────────────────────────────────────────────────────

export type EventSheetMode =
  | { type: "create"; date?: string; hour?: string }
  | { type: "view"; eventId: string }
  | {
      type: "edit";
      eventId: string;
      scope?: RecurrenceEditScope;
      occurrenceDate?: string;
    };

export interface EventSheetProps {
  visible: boolean;
  mode: EventSheetMode | null;
  onDismiss: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function eventToInitialValues(
  event: CalendarEvent,
): Partial<CreateEventRequest> {
  return {
    title: event.title,
    description: event.description ?? undefined,
    start: toLocalISOString(new Date(event.start)),
    end: toLocalISOString(new Date(event.end)),
    timezone: event.timezone ?? undefined,
    allDay: event.allDay ?? false,
    location: event.location ?? undefined,
    color: event.color ?? undefined,
    calendarId: event.calendarId,
    categoryId: event.categoryId ?? undefined,
    reminder: event.reminder ?? undefined,
    recurrence: event.recurrence ?? undefined,
  };
}

const SCOPE_OPTIONS: {
  label: string;
  scope: RecurrenceEditScope & RecurrenceDeleteScope;
}[] = [
  { label: "This occurrence", scope: "this_only" },
  { label: "This and future", scope: "this_and_future" },
  { label: "All occurrences", scope: "all" },
];

// ─── Icon wrapper (matches web: w-6 h-6 centered) ───────────────────────────

function IconBox({
  name,
  color,
}: {
  name: React.ComponentProps<typeof Feather>["name"];
  color: string;
}) {
  return (
    <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
      <Feather name={name} size={16} color={color} />
    </View>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EventSheet({ visible, mode, onDismiss }: EventSheetProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();

  const [viewMode, setViewMode] = useState<"view" | "edit">("view");
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [editScope, setEditScope] = useState<RecurrenceEditScope | undefined>();
  const [editOccurrenceDate, setEditOccurrenceDate] = useState<string | undefined>();
  const [scopeModalVisible, setScopeModalVisible] = useState(false);
  const [scopeAction, setScopeAction] = useState<"edit" | "delete">("edit");

  const isCreate = mode?.type === "create";
  const isViewOrEdit = mode?.type === "view" || mode?.type === "edit";
  const eventId =
    mode?.type === "view" ? mode.eventId
    : mode?.type === "edit" ? mode.eventId
    : undefined;

  // Reset internal state when mode changes
  useMemo(() => {
    if (mode?.type === "create") {
      setViewMode("edit");
    } else if (mode?.type === "view") {
      setViewMode("view");
    } else if (mode?.type === "edit") {
      setViewMode("edit");
      setEditScope(mode.scope);
      setEditOccurrenceDate(mode.occurrenceDate);
    }
    setServerErrors([]);
  }, [mode]);

  // ─── Data fetching ─────────────────────────────────────────────────────

  const { data: event, isLoading: eventLoading } = useQuery({
    queryKey: QUERY_KEYS.eventDetail(eventId ?? ""),
    queryFn: () => calendarApiService.getEvent(eventId!),
    enabled: !!eventId && visible,
  });

  const { data: calendars, isLoading: calendarsLoading } = useQuery({
    queryKey: QUERY_KEYS.calendars(),
    queryFn: () => calendarApiService.getCalendars(),
    enabled: visible,
  });

  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: QUERY_KEYS.categories(),
    queryFn: () => calendarApiService.getCategories(),
    enabled: visible,
  });

  // ─── Mutations ─────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (data: CreateEventRequest) => calendarApiService.createEvent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setServerErrors([]);
      onDismiss();
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Failed to create event";
      setServerErrors([message]);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: CreateEventRequest) => {
      if (editScope) {
        return calendarApiService.editRecurringEvent(eventId!, {
          editScope,
          occurrenceDate: editOccurrenceDate,
          updates: data,
        });
      }
      return calendarApiService.updateEvent(eventId!, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      if (eventId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.eventDetail(eventId) });
      }
      setServerErrors([]);
      onDismiss();
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Failed to update event";
      setServerErrors([message]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({
      scope,
      occurrenceDate,
    }: {
      scope?: RecurrenceDeleteScope;
      occurrenceDate?: string;
    }) => {
      if (scope) {
        return calendarApiService.deleteRecurringEvent(eventId!, scope, occurrenceDate);
      }
      return calendarApiService.deleteEvent(eventId!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      if (eventId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.eventDetail(eventId) });
      }
      onDismiss();
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Failed to delete event";
      setServerErrors([message]);
    },
  });

  // ─── Handlers ──────────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    (data: CreateEventRequest) => {
      setServerErrors([]);
      if (isCreate) createMutation.mutate(data);
      else updateMutation.mutate(data);
    },
    [isCreate, createMutation, updateMutation],
  );

  const handleCancel = useCallback(() => {
    if (viewMode === "edit" && isViewOrEdit && event) {
      setViewMode("view");
      setServerErrors([]);
    } else {
      setServerErrors([]);
      onDismiss();
    }
  }, [viewMode, isViewOrEdit, event, onDismiss]);

  const handleClose = useCallback(() => {
    setServerErrors([]);
    onDismiss();
  }, [onDismiss]);

  const isRecurring = !!(event?.recurrence || event?.parentEventId);

  const handleEditPress = useCallback(() => {
    if (isRecurring) {
      setScopeAction("edit");
      setScopeModalVisible(true);
    } else {
      setEditScope(undefined);
      setEditOccurrenceDate(undefined);
      setViewMode("edit");
    }
  }, [isRecurring]);

  const handleDeletePress = useCallback(() => {
    if (isRecurring) {
      setScopeAction("delete");
      setScopeModalVisible(true);
    } else {
      Alert.alert("Delete event?", "This action cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate({}) },
      ]);
    }
  }, [isRecurring, deleteMutation]);

  const handleScopeSelect = useCallback(
    (scope: RecurrenceEditScope & RecurrenceDeleteScope) => {
      setScopeModalVisible(false);
      const occDate = event?.start ? new Date(event.start).toISOString() : undefined;
      if (scopeAction === "edit") {
        setEditScope(scope);
        setEditOccurrenceDate(occDate);
        setViewMode("edit");
      } else {
        Alert.alert("Delete event?", "This action cannot be undone.", [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => deleteMutation.mutate({ scope, occurrenceDate: occDate }),
          },
        ]);
      }
    },
    [scopeAction, event, deleteMutation],
  );

  // ─── Initial values ───────────────────────────────────────────────────

  const initialValues = useMemo(() => {
    if (isViewOrEdit && event) return eventToInitialValues(event);
    if (isCreate && mode?.type === "create" && mode.date) {
      const startDate = new Date(mode.date);
      if (isNaN(startDate.getTime())) return undefined;
      if (mode.hour !== undefined) {
        const h = parseInt(mode.hour, 10);
        if (!isNaN(h)) startDate.setHours(h, 0, 0, 0);
      }
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
      return { start: toLocalISOString(startDate), end: toLocalISOString(endDate) } satisfies Partial<CreateEventRequest>;
    }
    return undefined;
  }, [isCreate, isViewOrEdit, mode, event]);

  // ─── Derived ───────────────────────────────────────────────────────────

  const isLoading = calendarsLoading || categoriesLoading || (isViewOrEdit && eventLoading);
  const isPending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const sheetTitle = isCreate ? "Create Event" : viewMode === "view" ? "Event Details" : "Edit Event";
  const iconColor = theme.colors.mutedForeground;

  const calendarInfo = useMemo(() => {
    if (!event || !calendars) return null;
    return calendars.find((c) => c.id === event.calendarId) ?? null;
  }, [event, calendars]);

  const categoryInfo = useMemo(() => {
    if (!event || !categories) return null;
    return categories.find((c) => c.id === event.categoryId) ?? null;
  }, [event, categories]);

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <>
      <BottomSheet visible={visible} onDismiss={handleClose} title={sheetTitle}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle} accessibilityRole="header" numberOfLines={1}>
            {sheetTitle}
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primaryBase} />
            <Text style={styles.loadingText}>Loading…</Text>
          </View>
        ) : viewMode === "view" && event ? (
          <>
            {/* ── View mode body ─────────────────────────────────── */}
            <View style={styles.viewBody}>
              {/* Title */}
              <View style={styles.viewRow}>
                <IconBox name="calendar" color={iconColor} />
                <Text style={styles.viewTitle} numberOfLines={2}>
                  {event.title || "Untitled Event"}
                </Text>
              </View>

              <View style={styles.viewDivider} />

              {/* Date & time */}
              <View style={styles.viewRow}>
                <IconBox name="clock" color={iconColor} />
                <View style={styles.viewRowContent}>
                  <Text style={styles.viewText}>{formatEventDate(event)}</Text>
                  <Text style={styles.viewSubtext}>{formatEventTime(event)}</Text>
                </View>
              </View>

              {/* Calendar */}
              {calendarInfo && (
                <View style={styles.viewRow}>
                  <View style={styles.iconBoxWrapper}>
                    <View
                      style={[
                        styles.calendarDot,
                        {
                          backgroundColor:
                            theme.colors.calendar[
                              calendarInfo.color as keyof typeof theme.colors.calendar
                            ]?.bg ?? calendarInfo.color,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.viewText}>{calendarInfo.name}</Text>
                </View>
              )}

              {/* Category */}
              {categoryInfo && (
                <View style={styles.viewRow}>
                  <View style={styles.iconBoxWrapper}>
                    <View
                      style={[styles.calendarDot, { backgroundColor: categoryInfo.color }]}
                    />
                  </View>
                  <Text style={styles.viewText}>{categoryInfo.name}</Text>
                </View>
              )}

              {/* Reminder */}
              {event.reminder != null && event.reminder >= 0 ? (
                <View style={styles.viewRow}>
                  <IconBox name="bell" color={iconColor} />
                  <Text style={styles.viewText}>{formatReminderLabel(event.reminder)}</Text>
                </View>
              ) : null}

              {/* Location */}
              {event.location ? (
                <View style={styles.viewRow}>
                  <IconBox name="map-pin" color={iconColor} />
                  <Text style={styles.viewText}>{event.location}</Text>
                </View>
              ) : null}

              {/* Description */}
              {event.description ? (
                <View style={[styles.viewRow, { alignItems: "flex-start" }]}>
                  <View style={{ marginTop: 2 }}>
                    <IconBox name="file-text" color={iconColor} />
                  </View>
                  <Text style={styles.viewDescription}>{event.description}</Text>
                </View>
              ) : null}

              {/* Recurrence */}
              {event.recurrence ? (
                <View style={styles.viewRow}>
                  <IconBox name="repeat" color={iconColor} />
                  <Text style={styles.viewText}>{event.recurrence}</Text>
                </View>
              ) : null}

              {/* Errors */}
              {serverErrors.length > 0 && (
                <View style={styles.errorContainer}>
                  {serverErrors.map((err, idx) => (
                    <Text key={idx} style={styles.errorText}>{err}</Text>
                  ))}
                </View>
              )}
            </View>

            {/* ── View mode footer ───────────────────────────────── */}
            <View style={styles.footer}>
              <Pressable
                style={styles.footerBtnOutlineDestructive}
                onPress={handleDeletePress}
                disabled={isPending}
                accessibilityRole="button"
                accessibilityLabel="Delete event"
              >
                {deleteMutation.isPending ? (
                  <ActivityIndicator size="small" color={theme.colors.destructive} />
                ) : (
                  <>
                    <Feather name="trash-2" size={14} color={theme.colors.destructive} />
                    <Text style={styles.footerTextDestructive}>Delete</Text>
                  </>
                )}
              </Pressable>

              <View style={styles.footerSpacer} />

              <Pressable
                style={styles.footerBtnOutline}
                onPress={handleClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={styles.footerText}>Close</Text>
              </Pressable>

              <Pressable
                style={[styles.footerBtnPrimary, { backgroundColor: theme.colors.primaryBase }]}
                onPress={handleEditPress}
                accessibilityRole="button"
                accessibilityLabel="Edit event"
              >
                <Feather name="edit-3" size={14} color={theme.colors.primaryForeground} />
                <Text style={[styles.footerTextPrimary, { color: theme.colors.primaryForeground }]}>
                  Edit
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          /* ── Edit / Create mode ──────────────────────────────── */
          <EventForm
            key={isCreate ? "create" : `edit-${eventId}-${editScope ?? "none"}`}
            calendars={calendars ?? []}
            categories={categories ?? []}
            serverErrors={serverErrors}
            isSubmitting={isPending}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            initialValues={initialValues}
            noScroll
          />
        )}
      </BottomSheet>

      {/* Scope picker modal for recurring events */}
      <Modal
        visible={scopeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setScopeModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setScopeModalVisible(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>
              {scopeAction === "edit" ? "Edit recurring event" : "Delete recurring event"}
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
    </>
  );
}


// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  const view = {
    header: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border + "66",
    },

    // ── View body ──────────────────────────────────────────────────────
    viewBody: {
      paddingHorizontal: 16,
      paddingVertical: 6,
    },
    viewRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 12,
      paddingHorizontal: 8,
      paddingVertical: 8,
      borderRadius: theme.borderRadius.md,
    },
    viewRowContent: {
      flex: 1,
    },
    viewDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border + "80",
      marginHorizontal: 16,
      marginVertical: 2,
    },
    iconBoxWrapper: {
      width: 24,
      height: 24,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    calendarDot: {
      width: 12,
      height: 12,
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: theme.colors.border + "99",
    },
    errorContainer: {
      backgroundColor: theme.colors.destructive + "18",
      borderRadius: theme.borderRadius.sm,
      padding: 12,
      marginTop: 8,
    },

    // ── Footer ─────────────────────────────────────────────────────────
    footer: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border + "80",
      backgroundColor: theme.colors.muted + "4D",
    },
    footerSpacer: { flex: 1 },
    footerBtnOutline: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: theme.borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
    },
    footerBtnOutlineDestructive: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: theme.borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.destructive + "4D",
      backgroundColor: theme.colors.background,
    },
    footerBtnPrimary: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: theme.borderRadius.md,
    },

    // ── Loading ────────────────────────────────────────────────────────
    loadingContainer: {
      paddingVertical: 40,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },

    // ── Scope modal ────────────────────────────────────────────────────
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
      padding: 16,
    },
    scopeOption: {
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    cancelOption: {
      paddingVertical: 12,
      alignItems: "center" as const,
      marginTop: 8,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    headerTitle: {
      fontSize: theme.typography.fontSize.base.size,
      fontWeight: theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    viewTitle: {
      flex: 1,
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    viewText: {
      flex: 1,
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.foreground,
    },
    viewSubtext: {
      fontSize: theme.typography.fontSize.xs.size,
      color: theme.colors.mutedForeground,
      marginTop: 2,
    },
    viewDescription: {
      flex: 1,
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.foreground,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
    },
    footerText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    footerTextDestructive: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.destructive,
    },
    footerTextPrimary: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    loadingText: {
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.mutedForeground,
      marginTop: 8,
    },
    errorText: {
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.destructive,
    },
    modalTitle: {
      fontSize: theme.typography.fontSize.lg.size,
      fontWeight: theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
      marginBottom: 12,
    },
    scopeOptionText: {
      fontSize: theme.typography.fontSize.base.size,
      color: theme.colors.foreground,
    },
    cancelOptionText: {
      fontSize: theme.typography.fontSize.base.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
