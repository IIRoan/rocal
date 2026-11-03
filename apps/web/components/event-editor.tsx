"use client";

import { useEffect, useImperativeHandle, useState, type Ref } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  canCurrentUserDeleteEvent,
  canCurrentUserEditEvent,
  isCancelledCalendarEvent,
} from "@workspace/calendar-core";
import type { CalendarEvent } from "@workspace/ui/components/calendar";
import { useIsMobile } from "@workspace/ui/hooks/use-mobile";
import { toast } from "@workspace/ui/lib/toast";

import { useSharedCalendarData } from "@/components/calendar-data-provider";
import { RecurringScopeModal } from "@/components/command-palette/recurring-scope-modal";
import { useCategories } from "@/hooks/use-categories";
import { useEventForm } from "@/hooks/use-event-form";
import {
  buildEventEditorEncryptionPreview,
  getEventDeleteConfirmCopy,
  isRecurringEventDeleteCandidate,
} from "@/lib/event-editor-view-model";
import { getActiveE2eeSession } from "@/lib/e2ee-session";
import type { UserSettings } from "@/lib/types/calendar";

import type { EventEditorMode } from "./command-palette-context";
import {
  downloadEventIcs,
  getInvitationResponseStatus,
  respondToEventInvitation,
} from "./event-editor/event-editor-invitation";
import { useEventEditorLivePreview } from "./event-editor/event-editor-preview";
import { EventConfirmDialog } from "./event-editor/event-confirm-dialog";
import { EventEditorView } from "./event-editor/event-editor-view";
import type { EventEditorInvitationResponseStatus } from "./event-editor/types";
import { useDiscardGuard } from "./event-editor/use-discard-guard";

interface EventEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventToEdit?: CalendarEvent | null;
  onEventSaved?: () => void;
  onBack: () => void;
  localSettings: UserSettings;
  editorMode?: EventEditorMode;
  anchorPosition?: { x: number; y: number } | null;
  initialEventViewMode?: "view" | "edit";
  updatePreviewEvent?: (updates: Partial<CalendarEvent>) => void;
  showBackButton?: boolean;
  closeHandleRef?: Ref<EventEditorCloseHandle>;
}

/** Lets a host surface that owns dismissal (the palette) ask before discarding unsaved changes. */
export type EventEditorCloseHandle = { requestClose: () => void };

export function EventEditor({
  open,
  onOpenChange,
  eventToEdit,
  onEventSaved,
  onBack,
  localSettings,
  editorMode = "modal",
  anchorPosition = null,
  initialEventViewMode = "view",
  updatePreviewEvent,
  showBackButton = false,
  closeHandleRef,
}: EventEditorProps) {
  const calendarData = useSharedCalendarData();
  const queryClient = useQueryClient();
  const { calendars } = calendarData;
  const { data: categories = [] } = useCategories(open);
  const eventForm = useEventForm({
    calendars,
    localSettings,
    onEventSaved,
    onClose: () => onOpenChange(false),
  });
  const {
    eventAllDay,
    eventCalendarId,
    eventDescription,
    eventEndDate,
    eventEndTime,
    eventLocation,
    eventStartDate,
    eventStartTime,
    eventTitle,
    eventViewMode,
    handleEventDelete: deleteEvent,
    handleEventSave: saveEvent,
    handleRecurringDelete: deleteRecurring,
    isRecurring,
    loadEventData,
    resetForm,
    selectedEvent,
    setEventViewMode,
    setShowRecurringDeleteModal,
    showRecurringDeleteModal,
    eventSaving,
  } = eventForm;
  const [inviteResponsePending, setInviteResponsePending] =
    useState<EventEditorInvitationResponseStatus | null>(null);
  const [showRecurringSaveModal, setShowRecurringSaveModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isMobile = useIsMobile();

  useEventEditorLivePreview({
    editorMode,
    eventAllDay,
    eventCalendarId,
    eventDescription,
    eventEndDate,
    eventEndTime,
    eventLocation,
    eventStartDate,
    eventStartTime,
    eventTitle,
    open,
    timezone: localSettings.timezone,
    updatePreviewEvent,
  });

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open, resetForm]);

  useEffect(() => {
    if (!eventToEdit || !open) {
      return;
    }

    loadEventData(eventToEdit);
    const canEditEvent = canCurrentUserEditEvent(eventToEdit);
    if (
      eventToEdit.id &&
      initialEventViewMode === "edit" &&
      !eventToEdit.isSynced &&
      canEditEvent
    ) {
      setEventViewMode("edit");
    }
  }, [
    eventToEdit,
    initialEventViewMode,
    loadEventData,
    open,
    setEventViewMode,
  ]);

  const canEditSelectedEvent = selectedEvent
    ? canCurrentUserEditEvent(selectedEvent)
    : true;
  const isViewMode = eventViewMode === "view" || !canEditSelectedEvent;
  const confirmsDiscard = eventForm.isDirty && !isViewMode;
  const discardGuard = useDiscardGuard(confirmsDiscard, (action) => {
    if (action === "close") {
      onOpenChange(false);
    } else if (action === "back") {
      onBack();
    } else if (selectedEvent && eventForm.isDirty) {
      // The read view shows the form fields, so discarded edits reload the stored event.
      loadEventData(selectedEvent);
    } else {
      setEventViewMode("view");
    }
  });
  useImperativeHandle(closeHandleRef, () => ({
    requestClose: () => discardGuard.requestLeave("close"),
  }));

  function handleEventSave() {
    discardGuard.cancel();
    if (selectedEvent && !canCurrentUserEditEvent(selectedEvent)) {
      toast.error("Imported invitation events are read-only for attendees.");
      return;
    }
    // A missing title or calendar reaches saveEvent, which names the fix in a toast.
    if (eventSaving) {
      return;
    }
    // The recurring edit endpoint cannot clear a rule, so turning repeat off keeps the plain series update.
    const stopsRepeating = Boolean(selectedEvent?.recurrence) && !isRecurring;
    if (
      selectedEvent?.id &&
      eventTitle.trim() &&
      !stopsRepeating &&
      isRecurringEventDeleteCandidate(selectedEvent)
    ) {
      setShowRecurringSaveModal(true);
      return;
    }
    // saveEvent toasts every failure path itself.
    void saveEvent(calendarData).catch(() => undefined);
  }

  function handleEventDelete() {
    if (
      selectedEvent &&
      (!selectedEvent.id || !canCurrentUserDeleteEvent(selectedEvent))
    ) {
      toast.error("Synced calendar events cannot be deleted.");
      return;
    }
    setShowDeleteConfirm(true);
  }

  function confirmEventDelete() {
    setShowDeleteConfirm(false);
    // deleteEvent toasts every failure path itself.
    void deleteEvent(calendarData).catch(() => undefined);
  }

  function handleInvitationResponse(
    status: EventEditorInvitationResponseStatus,
  ) {
    if (!selectedEvent?.id) {
      return;
    }
    // respondToEventInvitation toasts every failure path itself.
    void respondToEventInvitation({
      event: selectedEvent,
      status,
      refetchEvents: calendarData.refetchEvents,
      queryClient,
      loadEventData,
      onEventSaved,
      onClose: () => onOpenChange(false),
      setPending: setInviteResponsePending,
    }).catch(() => undefined);
  }

  const invitationStatus = getInvitationResponseStatus(
    selectedEvent,
    canEditSelectedEvent,
  );
  const badgeItem = selectedEvent?.id
    ? selectedEvent
    : buildEventEditorEncryptionPreview({
        hasActiveEncryptionSession: getActiveE2eeSession() !== null,
      });
  const dialogTitle = !selectedEvent?.id
    ? "Create event"
    : isViewMode
      ? "Event details"
      : "Edit event";

  return (
    <EventEditorView
      anchorPosition={anchorPosition}
      badgeItem={badgeItem}
      calendars={calendars}
      categories={categories}
      confirmsDiscard={confirmsDiscard}
      dialogTitle={dialogTitle}
      eventForm={eventForm}
      flags={{
        canEdit: canEditSelectedEvent,
        isRecurring,
        isViewMode,
      }}
      handleEventDelete={handleEventDelete}
      handleEventDownloadIcs={() => {
        if (selectedEvent) {
          downloadEventIcs(selectedEvent, {
            calendarName: calendars.find(
              (calendar) => calendar.id === selectedEvent.calendarId,
            )?.name,
            timezone: localSettings.timezone,
          });
        }
      }}
      handleEventSave={handleEventSave}
      handleInvitationResponse={handleInvitationResponse}
      invitationResponsePending={inviteResponsePending}
      invitationStatus={invitationStatus}
      layout={
        isMobile
          ? "mobile"
          : editorMode === "popover" && anchorPosition
            ? "popover"
            : showBackButton
              ? "embedded"
              : "dialog"
      }
      localSettings={localSettings}
      onBack={() => discardGuard.requestLeave("back")}
      onCancelEdit={() => discardGuard.requestLeave("view")}
      onOpenChange={(nextOpen) =>
        nextOpen ? onOpenChange(true) : discardGuard.requestLeave("close")
      }
      open={open}
      recurringModal={
        selectedEvent ? (
          <>
            <EventConfirmDialog
              {...discardGuard.dialog}
              title={selectedEvent.id ? "Discard your changes?" : "Discard this event?"}
              description={
                selectedEvent.id
                  ? "Your edits to this event haven’t been saved."
                  : "The event hasn’t been saved yet."
              }
              cancelLabel="Keep editing"
              confirmLabel={selectedEvent.id ? "Discard changes" : "Discard event"}
            />
            <EventConfirmDialog
              open={showDeleteConfirm}
              onOpenChange={setShowDeleteConfirm}
              {...getEventDeleteConfirmCopy(
                selectedEvent.title,
                !canEditSelectedEvent && isCancelledCalendarEvent(selectedEvent),
              )}
              onConfirm={confirmEventDelete}
            />
            <RecurringScopeModal
              open={showRecurringDeleteModal}
              onOpenChange={setShowRecurringDeleteModal}
              action="delete"
              eventTitle={selectedEvent.title}
              // deleteRecurring toasts every failure path itself.
              onSelect={(scope) =>
                void deleteRecurring(calendarData, scope).catch(
                  () => undefined,
                )
              }
              loading={eventSaving}
            />
            <RecurringScopeModal
              open={showRecurringSaveModal}
              onOpenChange={setShowRecurringSaveModal}
              action="edit"
              eventTitle={eventTitle}
              // saveEvent toasts every failure path itself.
              onSelect={(scope) => {
                setShowRecurringSaveModal(false);
                void saveEvent(calendarData, scope).catch(() => undefined);
              }}
              loading={eventSaving}
            />
          </>
        ) : null
      }
    />
  );
}
