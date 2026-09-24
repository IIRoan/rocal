import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  formatReminderShort,
  getErrorMessage,
  hasOptionalEventParticipants,
  isCancelledCalendarEvent,
  resolveTimezone,
  wallClockToUtc,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { useAuth } from "../../providers/AuthProvider";
import { useRecentContacts } from "../../hooks/use-recent-contacts";
import { useReminderTitleEncryptor } from "../../hooks/use-reminder-title-encryptor";
import { useEventReminders } from "../../hooks/use-event-reminders";
import { useUserTimeFormat } from "../../hooks/use-user-time-format";
import { extractRecentContactEntries } from "../../lib/record-recent-contacts";
import { useToast } from "../../providers/ToastProvider";
import { toastOperationWarnings } from "../../lib/operation-warnings";
import { persistEventReminderNotifications } from "../../lib/event-reminder-notifications";
import { calendarApiService } from "../../lib/api";
import { QUERY_KEYS } from "../../lib/query-keys";
import {
  buildOptimisticEvent,
  commitOptimisticEvent,
  findCachedEvent,
  generateOptimisticId,
  invalidateEventRanges,
  optimisticallyInsertEvent,
  optimisticallyRemoveEvent,
  rollbackFromSnapshot,
  type CacheSnapshot,
} from "../../lib/optimistic-events";
import {
  BottomSheet,
  BottomSheetClose,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetScrollView,
  BottomSheetTitle,
  type BottomSheetHandle,
} from "../BottomSheet";
import { CenteredLoader } from "../ui/loading";
import {
  SheetActions,
  SheetPrimaryButton,
  SheetSecondaryButton,
} from "../sheet/SheetActions";

import {
  EventForm,
  type EventFormHandle,
  type EventFormSubmission,
} from "./EventForm";
import { BlobatarAvatar } from "../BlobatarAvatar";
import { EventEditorRow } from "./EventEditorPrimitives";
import { toTimezonePickerISOString, parseCreateEventCalendarDay } from "./event-form-utils";
import {
  formatEventDate,
  formatEventTime,
  formatRecurrenceLabel,
} from "./event-detail-utils";
import { EncryptionStatusIcon } from "../calendar/EncryptionStatusIcon";
import { shouldShowEncryptionIcon } from "../calendar/timeline-event-content";
import { resolveEventSheetViewActions } from "./event-sheet-view-actions";


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
  presentKey?: number;
  onDismiss: () => void;
  onCloseComplete?: () => void;
}

function eventToInitialValues(
  event: CalendarEvent,
  timezone?: string,
): Partial<CreateEventRequest> {
  const resolvedTimezone = resolveTimezone(timezone ?? event.timezone);
  return {
    title: event.title,
    description: event.description ?? undefined,
    start: toTimezonePickerISOString(new Date(event.start), resolvedTimezone),
    end: toTimezonePickerISOString(new Date(event.end), resolvedTimezone),
    timezone: resolvedTimezone,
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

const BODY_MOUNT_FALLBACK_MS = 250;

const SCOPE_OPTIONS: {
  label: string;
  scope: RecurrenceEditScope & RecurrenceDeleteScope;
}[] = [
  { label: "This occurrence", scope: "this_only" },
  { label: "This and future", scope: "this_and_future" },
  { label: "All occurrences", scope: "all" },
];

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

export function EventSheet({
  visible,
  mode,
  presentKey,
  onDismiss,
  onCloseComplete,
}: EventSheetProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { recordUsage } = useRecentContacts();
  const encryptReminderTitle = useReminderTitleEncryptor();
  const { toast } = useToast();
  const bottomSheetRef = useRef<BottomSheetHandle>(null);
  const formRef = useRef<EventFormHandle>(null);
  const createSnapshotRef = useRef<CacheSnapshot>([]);
  const deleteSnapshotRef = useRef<CacheSnapshot>([]);

  const [viewMode, setViewMode] = useState<"view" | "edit">("view");
  // The body mounts once the open animation runs so rendering the form never delays the tap response.
  const [bodyReady, setBodyReady] = useState(false);
  if (!visible && bodyReady) {
    setBodyReady(false);
  }
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [editScope, setEditScope] = useState<RecurrenceEditScope | undefined>();
  const [editOccurrenceDate, setEditOccurrenceDate] = useState<
    string | undefined
  >();
  const [scopeModalVisible, setScopeModalVisible] = useState(false);
  const [scopeAction, setScopeAction] = useState<"edit" | "delete">("edit");

  const isCreate = mode?.type === "create";
  const isViewOrEdit = mode?.type === "view" || mode?.type === "edit";
  const eventId =
    mode?.type === "view"
      ? mode.eventId
      : mode?.type === "edit"
        ? mode.eventId
        : undefined;

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
  }, [mode]);

  const markBodyReady = useCallback(() => setBodyReady(true), []);

  useEffect(() => {
    if (!visible || bodyReady) return;
    const timer = setTimeout(markBodyReady, BODY_MOUNT_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [visible, bodyReady, markBodyReady]);

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

  const cachedEvent = eventId
    ? findCachedEvent(queryClient, eventId)
    : undefined;

  const { data: fetchedEvent, isLoading: eventLoading } = useQuery({
    queryKey: QUERY_KEYS.eventDetail(eventId ?? ""),
    queryFn: () => calendarApiService.getEvent(eventId!),
    enabled: !!eventId && visible,
    placeholderData: cachedEvent,
  });
  const event = fetchedEvent;

  const { data: calendars, isLoading: calendarsLoading } = useQuery({
    queryKey: QUERY_KEYS.calendars(),
    queryFn: () => calendarApiService.getCalendars(),
    enabled: visible,
  });
  const { data: settings } = useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
    enabled: visible,
  });
  const resolvedTimezone = resolveTimezone(settings?.timezone);
  const timeFormat = useUserTimeFormat();
  const { reminders: eventReminders, isLoading: remindersLoading } =
    useEventReminders(eventId, event?.reminder, visible && !isCreate);

  const createMutation = useMutation({
    mutationFn: ({ request }: EventFormSubmission) =>
      calendarApiService.createEvent(request),
    onMutate: async ({ request }: EventFormSubmission) => {
      const tempId = generateOptimisticId();
      const optimisticEvent = buildOptimisticEvent(
        request,
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
    onSuccess: (savedEvent, { request, reminders }, context) => {
      commitOptimisticEvent(queryClient, context.tempId, savedEvent);
      void invalidateEventRanges(queryClient, savedEvent);
      // Reminders are a separate round trip that never throws, so they stay off the timeline's critical path.
      void persistEventReminderNotifications(
        savedEvent.id,
        request.title,
        reminders,
        encryptReminderTitle,
      ).then(() =>
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.eventNotifications(savedEvent.id),
        }),
      );
      const entries = extractRecentContactEntries(
        request.participants,
        user?.email,
      );
      if (entries.length > 0) {
        recordUsage(entries, "calendar");
      }
      toast("Event created");
      toastOperationWarnings(toast, savedEvent);
    },
    onError: (err: unknown) => {
      rollbackFromSnapshot(queryClient, createSnapshotRef.current);
      toast(getErrorMessage(err, "Failed to create event"), "error");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ request, reminders }: EventFormSubmission) => {
      const saved = editScope
        ? await calendarApiService.editRecurringEvent(eventId!, {
            editScope,
            occurrenceDate: editOccurrenceDate,
            updates: request,
          })
        : await calendarApiService.updateEvent(eventId!, request);
      await persistEventReminderNotifications(
        saved.id,
        request.title,
        reminders,
        encryptReminderTitle,
      );
      return saved;
    },
    onSuccess: (savedEvent, { request }) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      if (eventId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.eventDetail(eventId),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.eventNotifications(eventId),
        });
      }
      const entries = extractRecentContactEntries(
        request.participants,
        user?.email,
      );
      if (entries.length > 0) {
        recordUsage(entries, "calendar");
      }
      setServerErrors([]);
      toast("Event updated");
      toastOperationWarnings(toast, savedEvent);
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
      toast("Event deleted");
    },
    onError: (err: unknown) => {
      rollbackFromSnapshot(queryClient, deleteSnapshotRef.current);
      toast(getErrorMessage(err, "Failed to delete event"), "error");
    },
  });

  const rsvpMutation = useMutation({
    mutationFn: (status: "accepted" | "declined" | "tentative") =>
      calendarApiService.respondToInvitation(eventId!, status),
    onSuccess: (result, status) => {
      if (eventId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.eventDetail(eventId),
        });
      }
      queryClient.invalidateQueries({ queryKey: ["events"] });
      if ("deleted" in result && result.deleted) {
        toast("Invitation declined");
        dismissSheet();
        return;
      }
      toast(
        status === "accepted"
          ? "Invitation accepted"
          : status === "tentative"
            ? "Marked as maybe"
            : "Invitation declined",
      );
    },
    onError: (err: unknown) => {
      toast(getErrorMessage(err, "Failed to respond to invitation"), "error");
    },
  });

  const handleSubmit = useCallback(
    (submission: EventFormSubmission) => {
      setServerErrors([]);
      if (isCreate) createMutation.mutate(submission);
      else updateMutation.mutate(submission);
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
  const recurrenceLabel = event
    ? formatRecurrenceLabel(event.recurrence) ??
      (event.parentEventId || event.isRecurringInstance ? "Repeats" : null)
    : null;

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

  const initialValues = useMemo(() => {
    if (isViewOrEdit && event) {
      return eventToInitialValues(event, resolvedTimezone);
    }
    if (isCreate && mode?.type === "create" && mode.date) {
      const calendarDay = parseCreateEventCalendarDay(
        mode.date,
        resolvedTimezone,
      );
      if (!calendarDay) return undefined;
      if (mode.hour !== undefined) {
        const h = parseInt(mode.hour, 10);
        if (!isNaN(h)) {
          const zonedStart = wallClockToUtc(
            calendarDay,
            h,
            0,
            resolvedTimezone,
          );
          const endDate = new Date(zonedStart.getTime() + 60 * 60 * 1000);
          return {
            start: toTimezonePickerISOString(zonedStart, resolvedTimezone),
            end: toTimezonePickerISOString(endDate, resolvedTimezone),
            timezone: resolvedTimezone,
          } satisfies Partial<CreateEventRequest>;
        }
      }
      const zonedStart = wallClockToUtc(
        calendarDay,
        0,
        0,
        resolvedTimezone,
      );
      const endDate = new Date(zonedStart.getTime() + 60 * 60 * 1000);
      return {
        start: toTimezonePickerISOString(zonedStart, resolvedTimezone),
        end: toTimezonePickerISOString(endDate, resolvedTimezone),
        timezone: resolvedTimezone,
      } satisfies Partial<CreateEventRequest>;
    }
    return undefined;
  }, [event, isCreate, isViewOrEdit, mode, resolvedTimezone]);

  // A new event needs no server data to start typing; the calendar chip fills in when calendars arrive.
  // The mode-reset effect runs after the first render, so derive create's mode to avoid a stale view frame.
  const sheetViewMode = isCreate ? "edit" : viewMode;
  // The form seeds its reminder list once, so editing waits for the saved reminders.
  const isLoading =
    !isCreate &&
    (calendarsLoading ||
      (eventLoading && !event) ||
      (sheetViewMode === "edit" && remindersLoading));
  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    rsvpMutation.isPending;
  const calendarInfo = useMemo(() => {
    if (!event || !calendars) return null;
    return calendars.find((c) => c.id === event.calendarId) ?? null;
  }, [event, calendars]);
  const calendarSwatch = calendarInfo
    ? (theme.colors.calendar[
        calendarInfo.color as keyof typeof theme.colors.calendar
      ]?.bg ?? calendarInfo.color)
    : theme.colors.calendar.blue.bg;
  const viewActions = resolveEventSheetViewActions(event);
  const showFormHeader = !isLoading && sheetViewMode === "edit";
  const sheetTitle = viewMode === "edit" ? "Edit event" : "Event";

  return (
    <>
      <BottomSheet
        ref={bottomSheetRef}
        visible={visible}
        presentKey={presentKey}
        onDismiss={handleSheetDismissRequest}
        onCloseComplete={onCloseComplete}
        onOpenAnimationStart={markBodyReady}
      >
        {showFormHeader ? (
          <BottomSheetHeader showClose={false} style={styles.formHeader}>
            <View style={styles.formHeaderRow}>
              <BottomSheetClose
                onPress={handleCancel}
                accessibilityLabel={isCreate ? "Discard event" : "Cancel editing"}
              />
              <Pressable
                onPress={() => formRef.current?.submit()}
                disabled={isPending}
                hitSlop={4}
                style={({ pressed }) => [
                  styles.savePill,
                  (pressed || isPending) && styles.savePillPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Save"
                accessibilityState={{ disabled: isPending }}
              >
                {isPending ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.primaryForeground}
                  />
                ) : (
                  <Text style={styles.savePillText}>Save</Text>
                )}
              </Pressable>
            </View>
          </BottomSheetHeader>
        ) : (
          <BottomSheetHeader>
            <BottomSheetTitle>{sheetTitle}</BottomSheetTitle>
          </BottomSheetHeader>
        )}
        {!bodyReady ? (
          <View style={styles.editBody} />
        ) : isLoading ? (
          <CenteredLoader theme={theme} message="Loading…" />
        ) : sheetViewMode === "view" && event ? (
          <>
            <BottomSheetScrollView
              style={styles.viewScroll}
              contentContainerStyle={styles.viewBody}
              showsVerticalScrollIndicator={false}
              bounces={false}
              overScrollMode="never"
            >
              {isCancelledCalendarEvent(event) ? (
                <View style={styles.cancelledBanner}>
                  <Feather
                    name="alert-triangle"
                    size={16}
                    color={theme.colors.destructive}
                  />
                  <View style={styles.viewRowContent}>
                    <Text style={styles.cancelledTitle}>Cancelled event</Text>
                    <Text style={styles.viewSubtext}>
                      The organiser cancelled this event. It stays on your
                      calendar until you remove it.
                    </Text>
                  </View>
                </View>
              ) : null}

              <View style={styles.viewTitleRow}>
                <View
                  style={[styles.titleBar, { backgroundColor: calendarSwatch }]}
                />
                <Text
                  style={[
                    styles.viewEventTitle,
                    isCancelledCalendarEvent(event) && styles.viewEventTitleCancelled,
                  ]}
                >
                  {event.title || "Untitled event"}
                </Text>
                <View style={styles.titleIcon}>
                  <EncryptionStatusIcon
                    encrypted={shouldShowEncryptionIcon(event)}
                    color={theme.colors.mutedForeground}
                    size={16}
                  />
                </View>
              </View>
              {event.isSynced ? (
                <Text style={styles.viewSyncedHint}>
                  Synced from an external calendar — view only
                </Text>
              ) : null}

              <View style={styles.viewRows}>
                <EventEditorRow icon="clock" label="Date and time">
                  <View style={styles.viewRowText}>
                    <Text style={styles.viewText}>
                      {formatEventDate(event, resolvedTimezone)}
                    </Text>
                    <Text style={styles.viewSubtext}>
                      {formatEventTime(event, resolvedTimezone, timeFormat)}
                      {recurrenceLabel ? ` · ${recurrenceLabel}` : ""}
                    </Text>
                  </View>
                </EventEditorRow>

                {calendarInfo ? (
                  <EventEditorRow icon="calendar" label="Calendar">
                    <View style={styles.viewInlineRow}>
                      <View
                        style={[
                          styles.calendarDot,
                          { backgroundColor: calendarSwatch },
                        ]}
                      />
                      <Text style={styles.viewText} numberOfLines={1}>
                        {calendarInfo.name}
                      </Text>
                    </View>
                  </EventEditorRow>
                ) : null}

                {hasOptionalEventParticipants(event.participants) ? (
                  <EventEditorRow icon="users" label="Participants">
                    <View style={styles.viewInlineRow}>
                      <Text style={styles.viewMutedText}>
                        {event.participants?.length ?? 0}{" "}
                        {event.participants?.length === 1
                          ? "participant"
                          : "participants"}
                      </Text>
                    </View>
                    <View style={styles.participantList}>
                      {(event.participants ?? []).map((participant) => (
                        <View key={participant.id} style={styles.participantRow}>
                          <BlobatarAvatar
                            email={participant.email}
                            name={participant.displayName}
                            src={participant.image}
                            size={28}
                          />
                          <View style={styles.participantMeta}>
                            <Text style={styles.viewText} numberOfLines={1}>
                              {participant.displayName || participant.email}
                            </Text>
                            <Text style={styles.viewSubtext} numberOfLines={1}>
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
                  </EventEditorRow>
                ) : null}

                {event.location ? (
                  <EventEditorRow icon="map-pin" label="Location">
                    <Text style={[styles.viewText, styles.viewRowText]}>
                      {event.location}
                    </Text>
                  </EventEditorRow>
                ) : null}

                {eventReminders.length > 0 ? (
                  <EventEditorRow icon="bell" label="Reminders">
                    <Text style={[styles.viewText, styles.viewRowText]}>
                      {eventReminders
                        .map((minutes) => `${formatReminderShort(minutes)} before`)
                        .join(", ")}
                    </Text>
                  </EventEditorRow>
                ) : null}

                {event.description ? (
                  <EventEditorRow icon="align-left" label="Description">
                    <Text style={[styles.viewDescription, styles.viewRowText]}>
                      {event.description}
                    </Text>
                  </EventEditorRow>
                ) : null}
              </View>

              {serverErrors.length > 0 && (
                <View style={styles.errorContainer}>
                  {serverErrors.map((err) => (
                    <Text key={err} style={styles.errorText}>
                      {err}
                    </Text>
                  ))}
                </View>
              )}
            </BottomSheetScrollView>
            <BottomSheetFooter>
              {viewActions.showInvitationActions ? (
                <View style={styles.rsvpRow}>
                  {(
                    [
                      ["accepted", "Accept"],
                      ["tentative", "Maybe"],
                      ["declined", "Decline"],
                    ] as const
                  ).map(([status, label]) => {
                    const selected = viewActions.invitationStatus === status;
                    return (
                      <Pressable
                        key={status}
                        onPress={() => rsvpMutation.mutate(status)}
                        disabled={isPending}
                        style={({ pressed }) => [
                          styles.rsvpButton,
                          selected && styles.rsvpButtonSelected,
                          pressed && styles.rsvpButtonPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ selected, disabled: isPending }}
                        accessibilityLabel={label}
                      >
                        <Text
                          style={[
                            styles.rsvpButtonText,
                            selected && styles.rsvpButtonTextSelected,
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              <SheetActions chrome={false}>
                {viewActions.showDelete ? (
                  <SheetSecondaryButton
                    label={viewActions.deleteLabel}
                    variant="destructive"
                    onPress={handleDeletePress}
                    disabled={isPending}
                  />
                ) : null}
                <SheetSecondaryButton label="Close" onPress={dismissSheet} />
                {viewActions.showEdit ? (
                  <SheetPrimaryButton
                    label="Edit"
                    icon="edit-2"
                    onPress={handleEditPress}
                    disabled={isPending}
                  />
                ) : null}
              </SheetActions>
            </BottomSheetFooter>
          </>
        ) : sheetViewMode === "view" ? (
          <>
            <View style={styles.viewBody}>
              <Text style={styles.viewText}>Couldn't load this event.</Text>
            </View>
            <BottomSheetFooter>
              <SheetActions chrome={false}>
                <SheetSecondaryButton label="Close" onPress={dismissSheet} />
              </SheetActions>
            </BottomSheetFooter>
          </>
        ) : (
          <View style={styles.editBody}>
            <EventForm
              ref={formRef}
              actionsPlacement="external"
              key={
                isCreate ? "create" : `edit-${eventId}-${editScope ?? "none"}`
              }
              calendars={calendars ?? []}
              serverErrors={serverErrors}
              isSubmitting={isPending}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              initialValues={initialValues}
              initialReminders={isCreate ? undefined : eventReminders}
              timezone={resolvedTimezone}
              timeFormat={timeFormat}
            />
          </View>
        )}
      </BottomSheet>

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

function createStyles(theme: ThemeTokens) {
  const view = {
    rsvpRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    rsvpButton: {
      flex: 1,
      minHeight: 44,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderRadius: theme.borderRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
    },
    rsvpButtonSelected: {
      borderColor: theme.colors.primaryBase,
      backgroundColor: theme.colors.primaryBase + "18",
    },
    rsvpButtonPressed: {
      opacity: 0.85,
    },
    viewBody: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 20,
    },
    viewScroll: {
      flex: 1,
    },
    viewTitleRow: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      gap: 12,
      marginBottom: 12,
    },
    titleBar: {
      width: 4,
      height: 20,
      marginTop: 5,
      borderRadius: theme.borderRadius.full,
    },
    titleIcon: {
      height: 30,
      justifyContent: "center" as const,
    },
    cancelledBanner: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      gap: 10,
      padding: 12,
      marginBottom: 12,
      borderRadius: theme.borderRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.destructive + "40",
      backgroundColor: theme.colors.destructive + "0D",
    },
    viewRows: {
      gap: 4,
    },
    viewRowText: {
      paddingVertical: 12,
    },
    viewInlineRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      minHeight: 44,
    },

    editBody: {
      flex: 1,
      minHeight: 0,
    },
    formHeader: {
      paddingVertical: theme.spacing["2"],
      borderBottomWidth: 0,
    },
    formHeaderRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
    },
    savePill: {
      minWidth: 72,
      height: 36,
      paddingHorizontal: theme.spacing["4"],
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.primaryBase,
    },
    savePillPressed: {
      opacity: 0.8,
    },
    viewRowContent: {
      flex: 1,
    },
    participantList: {
      gap: 8,
      paddingBottom: 4,
    },
    participantRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 10,
    },
    participantMeta: {
      flex: 1,
    },
    calendarDot: {
      width: 10,
      height: 10,
      borderRadius: theme.borderRadius.full,
    },
    errorContainer: {
      backgroundColor: theme.colors.destructive + "18",
      borderRadius: theme.borderRadius.sm,
      padding: 12,
      marginTop: 8,
    },

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
    rsvpButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    savePillText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.primaryForeground,
    },
    rsvpButtonTextSelected: {
      color: theme.colors.primaryBase,
    },
    viewEventTitle: {
      flex: 1,
      fontSize: theme.typography.fontSize.xl.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
      lineHeight: theme.typography.fontSize.xl.lineHeight,
    },
    viewEventTitleCancelled: {
      color: theme.colors.mutedForeground,
      textDecorationLine: "line-through" as const,
    },
    viewSyncedHint: {
      fontSize: theme.typography.fontSize.xs.size,
      color: theme.colors.mutedForeground,
      marginTop: -6,
      marginBottom: 10,
      paddingLeft: 16,
    },
    viewMutedText: {
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.mutedForeground,
    },
    cancelledTitle: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.destructive,
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
