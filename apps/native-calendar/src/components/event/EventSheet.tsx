import { useCallback, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import type { RecurrenceEditScope } from "@workspace/calendar-core";
import { resolveTimezone } from "@workspace/calendar-core";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { useEventReminders } from "../../hooks/use-event-reminders";
import { useCategories } from "../../hooks/use-categories";
import { useEventIcsExport } from "../../hooks/use-event-ics-export";
import { useUserTimeFormat } from "@workspace/native-core/hooks/use-user-time-format";
import { isOptimisticId } from "../../lib/optimistic-events";
import {
  useDeleteEventMutation,
  useRespondToInvitationMutation,
} from "../../hooks/use-event-sheet-mutations";
import { useEventSheetSubmit } from "../../hooks/use-event-sheet-submit";
import { useRecurringScopeActions } from "../../hooks/use-recurring-scope-actions";
import {
  useEventSheetCalendars,
  useEventSheetEvent,
  useEventSheetSettings,
} from "../../hooks/use-event-sheet-queries";
import {
  BottomSheet,
  BottomSheetFooter,
  type BottomSheetHandle,
} from "@workspace/native-core/components/BottomSheet";
import { CenteredLoader } from "@workspace/native-core/components/ui/loading";
import {
  SheetActions,
  SheetSecondaryButton,
} from "@workspace/native-core/components/sheet/SheetActions";

import { EventForm, type EventFormHandle } from "./EventForm";
import { formatRecurrenceLabel } from "./event-detail-utils";
import { resolveEventSheetViewActions } from "./event-sheet-view-actions";
import { createEventSheetStyles } from "./event-sheet-styles";
import { eventSheetInitialValues } from "./event-sheet-initial-values";
import { EventDetailsView } from "./EventDetailsView";
import { EventSheetHeader } from "./EventSheetHeader";
import { EventViewFooter } from "./EventViewFooter";
import { RecurringScopeModal } from "./RecurringScopeModal";

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

interface EventSheetEditState {
  mode: EventSheetMode | null;
  viewMode: "view" | "edit";
  editScope?: RecurrenceEditScope;
  editOccurrenceDate?: string;
}

function editStateForMode(mode: EventSheetMode | null): EventSheetEditState {
  return {
    mode,
    viewMode: mode?.type === "view" ? "view" : "edit",
    editScope: mode?.type === "edit" ? mode.scope : undefined,
    editOccurrenceDate: mode?.type === "edit" ? mode.occurrenceDate : undefined,
  };
}

export function EventSheet({
  visible,
  mode,
  presentKey,
  onDismiss,
  onCloseComplete,
}: EventSheetProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createEventSheetStyles(theme), [theme]);
  const bottomSheetRef = useRef<BottomSheetHandle>(null);
  const formRef = useRef<EventFormHandle>(null);

  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [editState, setEditState] = useState(() => editStateForMode(null));
  // Reset during render, not in an effect, so the body mounts in its final mode before the open slide starts.
  if (editState.mode !== mode) {
    setEditState(editStateForMode(mode));
    setServerErrors([]);
  }
  const { viewMode, editScope, editOccurrenceDate } = editState;

  const isCreate = mode?.type === "create";
  const isViewOrEdit = mode?.type === "view" || mode?.type === "edit";
  const eventId = isViewOrEdit ? mode.eventId : undefined;

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

  const { data: event, isLoading: eventLoading } = useEventSheetEvent(
    eventId,
    visible,
  );
  const { data: calendars, isLoading: calendarsLoading } =
    useEventSheetCalendars(visible);
  const { data: settings } = useEventSheetSettings(visible);
  const { data: categories } = useCategories(visible);
  const resolvedTimezone = resolveTimezone(settings?.timezone);
  const timeFormat = useUserTimeFormat();
  const { reminders: eventReminders, isLoading: remindersLoading } =
    useEventReminders(eventId, event?.reminder, visible && !isCreate);

  const { handleSubmit, isSubmitting } = useEventSheetSubmit({
    isCreate,
    eventId,
    editScope,
    editOccurrenceDate,
    onDismiss: dismissSheet,
    onServerErrors: setServerErrors,
  });

  const deleteMutation = useDeleteEventMutation({
    eventId,
    onDismiss: dismissSheet,
  });

  const rsvpMutation = useRespondToInvitationMutation({
    eventId,
    onDismiss: dismissSheet,
  });

  const handleCancel = useCallback(() => {
    if (viewMode === "edit" && isViewOrEdit && event) {
      setEditState((current) => ({ ...current, viewMode: "view" }));
      setServerErrors([]);
    } else {
      dismissSheet();
    }
  }, [viewMode, isViewOrEdit, event, dismissSheet]);

  const recurrenceLabel = event
    ? (formatRecurrenceLabel(event.recurrence) ??
      (event.parentEventId || event.isRecurringInstance ? "Repeats" : null))
    : null;

  const { mutate: deleteEvent } = deleteMutation;
  const startEdit = useCallback(
    (scope?: RecurrenceEditScope, occurrenceDate?: string) =>
      setEditState((current) => ({
        ...current,
        viewMode: "edit",
        editScope: scope,
        editOccurrenceDate: occurrenceDate,
      })),
    [],
  );
  const {
    scopeAction,
    scopeVisible,
    closeScopePrompt,
    handleEditPress,
    handleDeletePress,
    handleScopeSelect,
  } = useRecurringScopeActions({
    event,
    onStartEdit: startEdit,
    onDelete: deleteEvent,
  });

  const initialValues = useMemo(
    () => eventSheetInitialValues(mode, event, resolvedTimezone),
    [event, mode, resolvedTimezone],
  );

  // Create needs no server data; editing waits for saved reminders because the form seeds them once.
  const isLoading =
    !isCreate &&
    (calendarsLoading ||
      (eventLoading && !event) ||
      (viewMode === "edit" && remindersLoading));
  const isPending =
    isSubmitting || deleteMutation.isPending || rsvpMutation.isPending;
  const calendarInfo = useMemo(() => {
    if (!event || !calendars) return null;
    return calendars.find((c) => c.id === event.calendarId) ?? null;
  }, [event, calendars]);
  const calendarSwatch = calendarInfo
    ? (theme.colors.calendar[
        calendarInfo.color as keyof typeof theme.colors.calendar
      ]?.bg ?? calendarInfo.color)
    : theme.colors.calendar.blue.bg;
  const categoryInfo =
    event?.categoryId && categories
      ? (categories.find((category) => category.id === event.categoryId) ??
        null)
      : null;
  const viewActions = resolveEventSheetViewActions(event);
  const { exporting, exportIcs } = useEventIcsExport(
    event,
    calendarInfo?.name,
    resolvedTimezone,
  );

  return (
    <>
      <BottomSheet
        ref={bottomSheetRef}
        visible={visible}
        presentKey={presentKey}
        onDismiss={handleSheetDismissRequest}
        onCloseComplete={onCloseComplete}
      >
        <EventSheetHeader
          styles={styles}
          editing={!isLoading && viewMode === "edit"}
          isCreate={isCreate}
          isPending={isPending}
          title={viewMode === "edit" ? "Edit event" : "Event"}
          canExport={
            viewMode === "view" &&
            !!event &&
            !isOptimisticId(event.id) &&
            !isLoading
          }
          exporting={exporting}
          onCancel={handleCancel}
          onSave={() => formRef.current?.submit()}
          onExport={exportIcs}
        />
        {isLoading ? (
          <CenteredLoader theme={theme} message="Loading…" />
        ) : viewMode === "view" && event ? (
          <>
            <EventDetailsView
              event={event}
              styles={styles}
              resolvedTimezone={resolvedTimezone}
              timeFormat={timeFormat}
              recurrenceLabel={recurrenceLabel}
              calendarInfo={calendarInfo}
              calendarSwatch={calendarSwatch}
              categoryInfo={categoryInfo}
              eventReminders={eventReminders}
              serverErrors={serverErrors}
            />
            <EventViewFooter
              styles={styles}
              viewActions={viewActions}
              isPending={isPending}
              onRespond={(status) => rsvpMutation.mutate(status)}
              onDelete={handleDeletePress}
              onClose={dismissSheet}
              onEdit={handleEditPress}
            />
          </>
        ) : viewMode === "view" ? (
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
              categories={categories}
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

      <RecurringScopeModal
        action={scopeAction}
        visible={scopeVisible}
        styles={styles}
        onSelect={handleScopeSelect}
        onClose={closeScopePrompt}
      />
    </>
  );
}
