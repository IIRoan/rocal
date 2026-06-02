import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { ScrollView } from "react-native-gesture-handler";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CalendarEvent,
  CreateEventRequest,
  RecurrenceDeleteScope,
  RecurrenceEditScope,
} from "@workspace/calendar-core";
import { getErrorMessage } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../providers/AuthProvider";
import { calendarApiService } from "../../lib/api";
import { QUERY_KEYS } from "../../lib/query-keys";
import {
  buildOptimisticEvent,
  generateOptimisticId,
  optimisticallyInsertEvent,
  optimisticallyRemoveEvent,
  rollbackFromSnapshot,
  type CacheSnapshot,
} from "../../lib/optimistic-events";
import { BottomSheet, type BottomSheetHandle } from "../BottomSheet";
import { CenteredLoader } from "../ui/loading";

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
  onCloseComplete?: () => void;
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
    reminder: event.reminder ?? undefined,
    recurrence: event.recurrence ?? undefined,
    participants: event.participants?.map((participant) => ({
      email: participant.email,
      displayName: participant.displayName ?? undefined,
      role: participant.role,
      status: participant.status,
    })),
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
  bg = "transparent",
}: {
  name: React.ComponentProps<typeof Feather>["name"];
  color: string;
  bg?: string;
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

function formatParticipantStatus(status?: string) {
  switch (status) {
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    case "tentative":
      return "Tentative";
    default:
      return "Invited";
  }
}

function getParticipantInitials(
  participant: Pick<
    NonNullable<CalendarEvent["participants"]>[number],
    "displayName" | "email"
  >,
) {
  const label = participant.displayName?.trim() || participant.email;
  return label.replace(/@.*$/, "").slice(0, 2).toUpperCase() || "P";
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EventSheet({
  visible,
  mode,
  onDismiss,
  onCloseComplete,
}: EventSheetProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const bottomSheetRef = useRef<BottomSheetHandle>(null);
  const createSnapshotRef = useRef<CacheSnapshot>([]);
  const deleteSnapshotRef = useRef<CacheSnapshot>([]);

  const [viewMode, setViewMode] = useState<"view" | "edit">("view");
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [editScope, setEditScope] = useState<RecurrenceEditScope | undefined>();
  const [editOccurrenceDate, setEditOccurrenceDate] = useState<
    string | undefined
  >();
  const [scopeModalVisible, setScopeModalVisible] = useState(false);
  const [scopeAction, setScopeAction] = useState<"edit" | "delete">("edit");
  const viewScrollAtTopRef = useRef(true);
  const [canSwipeViewContentToDismiss, setCanSwipeViewContentToDismiss] =
    useState(false);

  const isCreate = mode?.type === "create";
  const isViewOrEdit = mode?.type === "view" || mode?.type === "edit";
  const eventId =
    mode?.type === "view"
      ? mode.eventId
      : mode?.type === "edit"
        ? mode.eventId
        : undefined;

  // Reset internal state when mode changes
  useEffect(() => {
    if (mode?.type === "create") {
      setViewMode("edit");
      setEditScope(undefined);
      setEditOccurrenceDate(undefined);
    } else if (mode?.type === "view") {
      setViewMode("view");
      setEditScope(undefined);
      setEditOccurrenceDate(undefined);
    } else if (mode?.type === "edit") {
      setViewMode("edit");
      setEditScope(mode.scope);
      setEditOccurrenceDate(mode.occurrenceDate);
    }
    setServerErrors([]);
    viewScrollAtTopRef.current = true;
    setCanSwipeViewContentToDismiss(mode?.type === "view");
  }, [mode]);

  useEffect(() => {
    if (viewMode !== "view") {
      setCanSwipeViewContentToDismiss(false);
      return;
    }

    viewScrollAtTopRef.current = true;
    setCanSwipeViewContentToDismiss(true);
  }, [viewMode]);

  const handleSheetDismissRequest = useCallback(() => {
    setServerErrors([]);
    onDismiss();
  }, [onDismiss]);

  const dismissSheet = useCallback(() => {
    setServerErrors([]);
    if (bottomSheetRef.current) {
      bottomSheetRef.current.dismiss();
      return;
    }
    onDismiss();
  }, [onDismiss]);

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

  // ─── Mutations ─────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (data: CreateEventRequest) =>
      calendarApiService.createEvent(data),
    onMutate: async (data: CreateEventRequest) => {
      const tempId = generateOptimisticId();
      const optimisticEvent = buildOptimisticEvent(
        data,
        user?.id ?? "",
        tempId,
      );
      createSnapshotRef.current = await optimisticallyInsertEvent(
        queryClient,
        optimisticEvent,
      );
      setServerErrors([]);
      dismissSheet();
      return { tempId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (err: unknown) => {
      rollbackFromSnapshot(queryClient, createSnapshotRef.current);
      Alert.alert(
        "Couldn't create event",
        getErrorMessage(err, "Failed to create event"),
      );
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
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.eventDetail(eventId),
        });
      }
      setServerErrors([]);
      dismissSheet();
    },
    onError: (err: unknown) => {
      setServerErrors([getErrorMessage(err, "Failed to update event")]);
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
        return calendarApiService.deleteRecurringEvent(
          eventId!,
          scope,
          occurrenceDate,
        );
      }
      return calendarApiService.deleteEvent(eventId!);
    },
    onMutate: async () => {
      if (eventId) {
        deleteSnapshotRef.current = await optimisticallyRemoveEvent(
          queryClient,
          eventId,
        );
        dismissSheet();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      if (eventId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.eventDetail(eventId),
        });
      }
    },
    onError: (err: unknown) => {
      rollbackFromSnapshot(queryClient, deleteSnapshotRef.current);
      Alert.alert(
        "Couldn't delete event",
        getErrorMessage(err, "Failed to delete event"),
      );
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
      dismissSheet();
    }
  }, [viewMode, isViewOrEdit, event, dismissSheet]);

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
      const occDate = event?.start
        ? new Date(event.start).toISOString()
        : undefined;
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
            onPress: () =>
              deleteMutation.mutate({ scope, occurrenceDate: occDate }),
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
      return {
        start: toLocalISOString(startDate),
        end: toLocalISOString(endDate),
      } satisfies Partial<CreateEventRequest>;
    }
    return undefined;
  }, [isCreate, isViewOrEdit, mode, event]);

  // ─── Derived ───────────────────────────────────────────────────────────

  const isLoading = calendarsLoading || (isViewOrEdit && eventLoading);
  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;
  const iconColor = theme.colors.mutedForeground;
  const iconBg = theme.colors.mutedForeground + "18";

  const calendarInfo = useMemo(() => {
    if (!event || !calendars) return null;
    return calendars.find((c) => c.id === event.calendarId) ?? null;
  }, [event, calendars]);

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <>
      <BottomSheet
        ref={bottomSheetRef}
        visible={visible}
        onDismiss={handleSheetDismissRequest}
        onCloseComplete={onCloseComplete}
        swipeContentToDismiss={canSwipeViewContentToDismiss}
      >
        {isLoading ? (
          <CenteredLoader theme={theme} message="Loading…" />
        ) : viewMode === "view" && event ? (
          <>
            {/* ── View mode body ─────────────────────────────────── */}
            <ScrollView
              style={styles.viewScroll}
              contentContainerStyle={[
                styles.viewBody,
                { paddingBottom: Math.max(insets.bottom, 16) + 88 },
              ]}
              showsVerticalScrollIndicator={false}
              bounces={false}
              overScrollMode="never"
              scrollEventThrottle={16}
              onScroll={(e) => {
                const nextAtTop = e.nativeEvent.contentOffset.y <= 0.5;
                if (viewScrollAtTopRef.current !== nextAtTop) {
                  viewScrollAtTopRef.current = nextAtTop;
                  setCanSwipeViewContentToDismiss(nextAtTop);
                }
              }}
            >
              {/* Event title */}
              <Text style={styles.viewEventTitle} numberOfLines={2}>
                {event.title || "Untitled Event"}
              </Text>

              {/* Primary section: date/time + calendar + reminder + recurrence */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionRow}>
                  <IconBox name="clock" color={iconColor} bg={iconBg} />
                  <View style={styles.viewRowContent}>
                    <Text style={styles.viewText}>
                      {formatEventDate(event)}
                    </Text>
                    <Text style={styles.viewSubtext}>
                      {formatEventTime(event)}
                    </Text>
                  </View>
                </View>

                {calendarInfo && (
                  <>
                    <View style={styles.sectionDivider} />
                    <View style={styles.sectionRow}>
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
                  </>
                )}

                {event.reminder != null && event.reminder >= 0 ? (
                  <>
                    <View style={styles.sectionDivider} />
                    <View style={styles.sectionRow}>
                      <IconBox name="bell" color={iconColor} bg={iconBg} />
                      <Text style={styles.viewText}>
                        {formatReminderLabel(event.reminder)}
                      </Text>
                    </View>
                  </>
                ) : null}

                {event.recurrence ? (
                  <>
                    <View style={styles.sectionDivider} />
                    <View style={styles.sectionRow}>
                      <IconBox name="repeat" color={iconColor} bg={iconBg} />
                      <Text style={styles.viewText}>{event.recurrence}</Text>
                    </View>
                  </>
                ) : null}

                {event.participants && event.participants.length > 0 ? (
                  <>
                    <View style={styles.sectionDivider} />
                    <View style={[styles.sectionRow, styles.participantSectionRow]}>
                      <IconBox name="users" color={iconColor} bg={iconBg} />
                      <View style={styles.participantList}>
                        {event.participants.map((participant) => (
                          <View
                            key={participant.id}
                            style={styles.participantRow}
                          >
                            {participant.image ? (
                              <Image
                                source={{ uri: participant.image }}
                                style={styles.participantAvatarImage}
                              />
                            ) : (
                              <View style={styles.participantAvatarFallback}>
                                <Text style={styles.participantAvatarFallbackText}>
                                  {getParticipantInitials(participant)}
                                </Text>
                              </View>
                            )}
                            <View style={styles.participantMeta}>
                              <Text style={styles.viewText}>
                                {participant.displayName || participant.email}
                              </Text>
                              <Text style={styles.viewSubtext}>
                                {participant.role === "organizer"
                                  ? "Organizer"
                                  : formatParticipantStatus(participant.status)}
                                {participant.displayName
                                  ? ` · ${participant.email}`
                                  : ""}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                  </>
                ) : null}
              </View>

              {/* Location */}
              {event.location ? (
                <View style={styles.sectionCard}>
                  <View style={styles.sectionRow}>
                    <IconBox name="map-pin" color={iconColor} bg={iconBg} />
                    <Text style={styles.viewText}>{event.location}</Text>
                  </View>
                </View>
              ) : null}

              {/* Description */}
              {event.description ? (
                <View style={styles.sectionCard}>
                  <View
                    style={[styles.sectionRow, { alignItems: "flex-start" }]}
                  >
                    <View style={{ marginTop: 2 }}>
                      <IconBox name="file-text" color={iconColor} bg={iconBg} />
                    </View>
                    <Text style={styles.viewDescription}>
                      {event.description}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Delete */}
              {event.id ? (
                <Pressable
                  style={styles.deleteRow}
                  onPress={handleDeletePress}
                  disabled={isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Delete event"
                >
                  <Feather
                    name="trash-2"
                    size={16}
                    color={theme.colors.destructive}
                  />
                  <Text style={styles.deleteText}>Delete event</Text>
                </Pressable>
              ) : null}

              {/* Errors */}
              {serverErrors.length > 0 && (
                <View style={styles.errorContainer}>
                  {serverErrors.map((err) => (
                    <Text key={err} style={styles.errorText}>
                      {err}
                    </Text>
                  ))}
                </View>
              )}
            </ScrollView>
            <View
              style={[
                styles.bottomActionBar,
                { paddingBottom: Math.max(insets.bottom, 12) },
              ]}
            >
              <Pressable
                style={styles.secondaryActionButton}
                onPress={dismissSheet}
                accessibilityRole="button"
                accessibilityLabel="Close event drawer"
              >
                <Text style={styles.secondaryActionText}>Close</Text>
              </Pressable>
              {event.id ? (
                <Pressable
                  style={[
                    styles.primaryActionButton,
                    { backgroundColor: theme.colors.primaryBase },
                  ]}
                  onPress={handleEditPress}
                  accessibilityRole="button"
                  accessibilityLabel="Edit event"
                >
                  <Feather
                    name="edit-2"
                    size={14}
                    color={theme.colors.primaryForeground}
                  />
                  <Text
                    style={[
                      styles.primaryActionText,
                      { color: theme.colors.primaryForeground },
                    ]}
                  >
                    Edit
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </>
        ) : (
          /* ── Edit / Create mode ──────────────────────────────── */
          <View style={styles.editBody}>
            <EventForm
              key={
                isCreate ? "create" : `edit-${eventId}-${editScope ?? "none"}`
              }
              calendars={calendars ?? []}
              serverErrors={serverErrors}
              isSubmitting={isPending}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              initialValues={initialValues}
            />
          </View>
        )}
      </BottomSheet>

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
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  const view = {
    viewBody: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 20,
    },
    viewScroll: {
      flex: 1,
    },
    bottomActionBar: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border + "66",
      backgroundColor: theme.colors.card,
    },
    secondaryActionButton: {
      minHeight: 46,
      paddingHorizontal: 18,
      borderRadius: theme.borderRadius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    primaryActionButton: {
      flex: 1,
      minHeight: 46,
      borderRadius: theme.borderRadius.lg,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 8,
    },
    editBody: {
      flex: 1,
      minHeight: 0,
    },
    // Card section
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
    },
    participantSectionRow: {
      alignItems: "flex-start" as const,
    },
    sectionDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border + "60",
      marginLeft: 14 + 32 + 12,
    },
    viewRowContent: {
      flex: 1,
    },
    iconBoxWrapper: {
      width: 32,
      height: 32,
      borderRadius: 9,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: theme.colors.mutedForeground + "18",
    },
    participantList: {
      flex: 1,
      gap: 10,
    },
    participantRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 10,
    },
    participantAvatarImage: {
      width: 32,
      height: 32,
      borderRadius: 16,
    },
    participantAvatarFallback: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: theme.colors.muted,
    },
    participantMeta: {
      flex: 1,
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
    deleteRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 13,
      marginTop: 4,
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.destructive + "10",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.destructive + "28",
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
    secondaryActionText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    primaryActionText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
    },
    viewEventTitle: {
      fontSize: theme.typography.fontSize.xl.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
      marginBottom: 10,
      paddingHorizontal: 4,
      lineHeight: theme.typography.fontSize.xl.lineHeight,
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
    participantAvatarFallbackText: {
      fontSize: theme.typography.fontSize.xs.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    deleteText: {
      flex: 1,
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.destructive,
    },
    errorText: {
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.destructive,
    },
    modalTitle: {
      fontSize: theme.typography.fontSize.lg.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
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
