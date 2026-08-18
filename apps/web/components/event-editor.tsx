"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  canCurrentUserDeleteEvent,
  canCurrentUserEditEvent,
} from "@workspace/calendar-core";
import type { CalendarEvent } from "@workspace/ui/components/calendar";
import { useIsMobile } from "@workspace/ui/hooks/use-mobile";
import { toast } from "sonner";

import { useSharedCalendarData } from "@/components/calendar-data-provider";
import { RecurringDeleteModal } from "@/components/command-palette/recurring-delete-modal";
import { useEventForm } from "@/hooks/use-event-form";
import { buildEventEditorEncryptionPreview } from "@/lib/event-editor-view-model";
import { getActiveE2eeSession } from "@/lib/e2ee-session";
import type { UserSettings } from "@/lib/types/calendar";

import type { EventEditorMode } from "./command-palette-context";
import {
  downloadEventIcs,
  getInvitationResponseStatus,
  respondToEventInvitation,
} from "./event-editor/event-editor-invitation";
import { useEventEditorLivePreview } from "./event-editor/event-editor-preview";
import { EventEditorView } from "./event-editor/event-editor-view";
import type { EventEditorInvitationResponseStatus } from "./event-editor/types";

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
}

type SectionVisibility = {
  description: boolean;
  location: boolean;
  participants: boolean;
};

const HIDDEN_SECTIONS: SectionVisibility = {
  description: false,
  location: false,
  participants: false,
};

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
}: EventEditorProps) {
  const calendarData = useSharedCalendarData();
  const queryClient = useQueryClient();
  const { calendars } = calendarData;
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
    handleRecurringDeleteAll: deleteRecurringAll,
    handleRecurringDeleteThis: deleteRecurringThis,
    isRecurring,
    loadEventData,
    resetForm,
    selectedEvent,
    setEventViewMode,
    setEventLocation,
    setEventDescription,
    setEventParticipants,
    setIsRecurring,
    setShowNotifications,
    setShowRecurringDeleteModal,
    showNotifications,
    showRecurringDeleteModal,
    eventSaving,
  } = eventForm;
  const [sections, setSections] = useState<SectionVisibility>(HIDDEN_SECTIONS);
  const [inviteResponsePending, setInviteResponsePending] =
    useState<EventEditorInvitationResponseStatus | null>(null);
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
      requestAnimationFrame(() => {
        setSections(HIDDEN_SECTIONS);
      });
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

    requestAnimationFrame(() => {
      setSections({
        description: Boolean(eventToEdit.description),
        location: Boolean(eventToEdit.location),
        participants: (eventToEdit.participants?.length ?? 0) > 0,
      });
    });
  }, [
    eventToEdit,
    initialEventViewMode,
    loadEventData,
    open,
    setEventViewMode,
  ]);

  function handleEventSave() {
    if (selectedEvent && !canCurrentUserEditEvent(selectedEvent)) {
      toast.error("Imported invitation events are read-only for attendees.");
      return;
    }
    void saveEvent(calendarData);
  }

  function handleEventDelete() {
    if (
      selectedEvent &&
      (!selectedEvent.id || !canCurrentUserDeleteEvent(selectedEvent))
    ) {
      toast.error("Synced calendar events cannot be deleted.");
      return;
    }
    void deleteEvent(calendarData);
  }

  function handleInvitationResponse(
    status: EventEditorInvitationResponseStatus,
  ) {
    if (!selectedEvent?.id) {
      return;
    }
    void respondToEventInvitation({
      event: selectedEvent,
      status,
      refetchEvents: calendarData.refetchEvents,
      queryClient,
      loadEventData,
      onEventSaved,
      onClose: () => onOpenChange(false),
      setPending: setInviteResponsePending,
    });
  }

  function setDescriptionVisible(value: boolean) {
    setSections((current) => ({ ...current, description: value }));
    if (!value) {
      setEventDescription("");
    }
  }

  function setLocationVisible(value: boolean) {
    setSections((current) => ({ ...current, location: value }));
    if (!value) {
      setEventLocation("");
    }
  }

  function setParticipantsVisible(value: boolean) {
    setSections((current) => ({ ...current, participants: value }));
    if (!value) {
      setEventParticipants([]);
    }
  }

  const canEditSelectedEvent = selectedEvent
    ? canCurrentUserEditEvent(selectedEvent)
    : true;
  const invitationStatus = getInvitationResponseStatus(
    selectedEvent,
    canEditSelectedEvent,
  );
  const isViewMode = eventViewMode === "view" || !canEditSelectedEvent;
  const badgeItem = selectedEvent?.id
    ? selectedEvent
    : buildEventEditorEncryptionPreview({
        hasActiveEncryptionSession: getActiveE2eeSession() !== null,
      });
  const dialogTitle = !selectedEvent?.id
    ? "Create Event"
    : isViewMode
      ? "Event Details"
      : "Edit Event";

  return (
    <EventEditorView
      anchorPosition={anchorPosition}
      badgeItem={badgeItem}
      calendars={calendars}
      dialogTitle={dialogTitle}
      eventForm={eventForm}
      flags={{
        canEdit: canEditSelectedEvent,
        isRecurring,
        isViewMode,
      }}
      handleEventDelete={handleEventDelete}
      handleEventDownloadIcs={() => {
        if (selectedEvent?.id) {
          void downloadEventIcs(selectedEvent.id);
        }
      }}
      handleEventSave={handleEventSave}
      handleInvitationResponse={handleInvitationResponse}
      handleToggleDescription={() =>
        setDescriptionVisible(!sections.description)
      }
      handleToggleLocation={() => setLocationVisible(!sections.location)}
      handleToggleNotifications={() => setShowNotifications(!showNotifications)}
      handleToggleParticipants={() =>
        setParticipantsVisible(!sections.participants)
      }
      handleToggleRecurring={() => setIsRecurring(!isRecurring)}
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
      onBack={onBack}
      onOpenChange={onOpenChange}
      open={open}
      recurringModal={
        selectedEvent ? (
          <RecurringDeleteModal
            open={showRecurringDeleteModal}
            onOpenChange={setShowRecurringDeleteModal}
            eventTitle={selectedEvent.title}
            onDeleteThis={() => deleteRecurringThis(calendarData)}
            onDeleteAll={() => deleteRecurringAll(calendarData)}
            loading={eventSaving}
          />
        ) : null
      }
      setShowDescription={setDescriptionVisible}
      setShowLocation={setLocationVisible}
      setShowParticipants={setParticipantsVisible}
      visibleSections={{
        description: sections.description,
        location: sections.location,
        notifications: showNotifications,
        participants: sections.participants,
      }}
    />
  );
}
