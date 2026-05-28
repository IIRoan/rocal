"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  canCurrentUserEditEvent,
  getCurrentUserInvitationStatus,
  isCancelledCalendarEvent,
} from "@workspace/calendar-core";
import type { CalendarEvent } from "@workspace/ui/components/calendar";
import { EncryptionStatusBadge } from "@workspace/ui/components/calendar";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerShell,
  DrawerTitle,
} from "@workspace/ui/components/ui/drawer";
import { VisuallyHidden } from "@workspace/ui/components/ui/visually-hidden";
import { useIsMobile } from "@workspace/ui/hooks/use-mobile";
import { ArrowLeft, Plus } from "lucide-react";
import { toast } from "sonner";

import { useSharedCalendarData } from "@/components/calendar-data-provider";
import { RecurringDeleteModal } from "@/components/command-palette/recurring-delete-modal";
import { useEventForm } from "@/hooks/use-event-form";
import { calendarApiService } from "@/lib/calendar-api-service";
import { buildEventEditorEncryptionPreview } from "@/lib/event-editor-view-model";
import { getActiveE2eeSession } from "@/lib/e2ee-session";
import type { UserSettings } from "@/lib/types/calendar";

import { EventEditorBody } from "./event-editor/event-editor-body";
import { EventEditorFooter } from "./event-editor/event-editor-footer";
import { EventEditorDesktopHeader } from "./event-editor/event-editor-header";
import { EventEditorPopover } from "./event-editor/event-editor-popover";
import type { EventEditorMode } from "./command-palette-context";
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
  const { calendars } = calendarData;
  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);
  const eventForm = useEventForm({
    calendars,
    localSettings,
    onEventSaved,
    onClose: handleClose,
  });
  const {
    eventAllDay,
    eventCalendarId,
    eventDescription,
    eventEndDate,
    eventEndTime,
    eventLocation,
    eventNotifications,
    eventSaving,
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
    setIsRecurring,
    setShowNotifications,
    setShowRecurringDeleteModal,
    showNotifications,
    showRecurringDeleteModal,
  } = eventForm;
  const [showDescription, setShowDescription] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [inviteResponsePending, setInviteResponsePending] =
    useState<EventEditorInvitationResponseStatus | null>(null);
  const lastPreviewPayloadRef = useRef<string>("");

  useEffect(() => {
    if (!open) {
      resetForm();
      requestAnimationFrame(() => {
        setShowDescription(false);
        setShowLocation(false);
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
      if (eventToEdit.description) {
        setShowDescription(true);
      }

      if (eventToEdit.location) {
        setShowLocation(true);
      }
    });
  }, [
    eventToEdit,
    initialEventViewMode,
    loadEventData,
    open,
    setEventViewMode,
  ]);

  useEffect(() => {
    if (editorMode !== "popover" || !updatePreviewEvent || !open) {
      lastPreviewPayloadRef.current = "";
      return;
    }

    const [startHours, startMinutes] = eventStartTime.split(":").map(Number);
    const [endHours, endMinutes] = eventEndTime.split(":").map(Number);
    const start = new Date(eventStartDate);
    const end = new Date(eventEndDate);

    start.setHours(startHours || 0, startMinutes || 0, 0, 0);
    end.setHours(endHours || 0, endMinutes || 0, 0, 0);

    const payload = {
      allDay: eventAllDay,
      calendarId: eventCalendarId,
      description: eventDescription || "",
      endIso: end.toISOString(),
      location: eventLocation || "",
      startIso: start.toISOString(),
      title: eventTitle || "(No title)",
    };
    const payloadKey = JSON.stringify(payload);

    if (payloadKey === lastPreviewPayloadRef.current) {
      return;
    }

    lastPreviewPayloadRef.current = payloadKey;
    updatePreviewEvent({
      title: payload.title,
      start,
      end,
      allDay: payload.allDay,
      calendarId: payload.calendarId,
      location: payload.location || undefined,
      description: payload.description || undefined,
    });
  }, [
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
    updatePreviewEvent,
  ]);

  const handleEventSave = useCallback(() => {
    if (selectedEvent && !canCurrentUserEditEvent(selectedEvent)) {
      toast.error("Imported invitation events are read-only for attendees.");
      return;
    }
    void saveEvent(calendarData);
  }, [calendarData, saveEvent, selectedEvent]);
  const handleRecurringDeleteThis = useCallback(
    () => deleteRecurringThis(calendarData),
    [calendarData, deleteRecurringThis],
  );
  const handleRecurringDeleteAll = useCallback(
    () => deleteRecurringAll(calendarData),
    [calendarData, deleteRecurringAll],
  );
  const handleEventDownloadIcs = useCallback(async () => {
    if (!selectedEvent?.id) {
      return;
    }

    try {
      await calendarApiService.downloadEventICS(selectedEvent.id);
    } catch (error: any) {
      toast.error(error?.message || "Failed to download event as ICS file");
    }
  }, [selectedEvent]);
  const handleInvitationResponse = useCallback(
    async (status: EventEditorInvitationResponseStatus) => {
      if (!selectedEvent?.id) {
        return;
      }

      setInviteResponsePending(status);
      try {
        const result = await calendarApiService.respondToInvitation(
          selectedEvent.id,
          status,
        );
        void calendarData.refetchEvents();
        if ("deleted" in result && result.deleted) {
          // Event was declined and removed from calendar — close the modal
          onEventSaved?.();
          handleClose();
          toast.success("Invitation declined and removed from your calendar.");
        } else {
          const updatedEvent = result as CalendarEvent;
          loadEventData(updatedEvent);
          onEventSaved?.();
          toast.success(
            status === "accepted"
              ? "Invitation accepted."
              : "Marked as tentative.",
          );
        }
      } catch (error: any) {
        toast.error(error?.message || "Failed to update invitation response.");
      } finally {
        setInviteResponsePending(null);
      }
    },
    [calendarData, handleClose, loadEventData, onEventSaved, selectedEvent],
  );
  const handleToggleLocation = useCallback(() => {
    setShowLocation((current) => !current);
  }, []);
  const handleToggleDescription = useCallback(() => {
    setShowDescription((current) => !current);
  }, []);
  const handleToggleRecurring = useCallback(() => {
    setIsRecurring(!isRecurring);
  }, [isRecurring, setIsRecurring]);
  const handleToggleNotifications = useCallback(() => {
    setShowNotifications(!showNotifications);
  }, [setShowNotifications, showNotifications]);

  const canEditSelectedEvent = useMemo(
    () => (selectedEvent ? canCurrentUserEditEvent(selectedEvent) : true),
    [selectedEvent],
  );
  const isCancelledSelectedEvent = useMemo(
    () => (selectedEvent ? isCancelledCalendarEvent(selectedEvent) : false),
    [selectedEvent],
  );
  const canDeleteSelectedEvent = useMemo(() => {
    if (!selectedEvent?.id || selectedEvent.isSynced) {
      return false;
    }

    return canEditSelectedEvent || isCancelledSelectedEvent;
  }, [canEditSelectedEvent, isCancelledSelectedEvent, selectedEvent]);
  const handleEventDelete = useCallback(() => {
    if (selectedEvent && !canDeleteSelectedEvent) {
      toast.error("Imported invitation events are read-only for attendees.");
      return;
    }
    void deleteEvent(calendarData);
  }, [
    calendarData,
    canDeleteSelectedEvent,
    deleteEvent,
    selectedEvent,
  ]);
  const invitationStatus = useMemo(() => {
    if (!selectedEvent || canEditSelectedEvent) {
      return null;
    }

    const status = getCurrentUserInvitationStatus(selectedEvent);
    return status === "accepted" ||
      status === "declined" ||
      status === "tentative"
      ? status
      : null;
  }, [canEditSelectedEvent, selectedEvent]);
  const isViewMode = eventViewMode === "view" || !canEditSelectedEvent;
  const isMobile = useIsMobile();
  const selectedCalendar = useMemo(
    () => calendars.find((calendar) => calendar.id === eventCalendarId),
    [calendars, eventCalendarId],
  );
  const enabledNotificationCount = useMemo(
    () =>
      eventNotifications.filter((notification) => notification.isEnabled)
        .length,
    [eventNotifications],
  );
  const hasActiveEncryptionSession = useMemo(
    () => getActiveE2eeSession() !== null,
    [],
  );
  const previewBadgeItem = useMemo(
    () =>
      buildEventEditorEncryptionPreview({
        enabledNotificationCount,
        eventEncryptionMode: localSettings?.eventEncryptionMode,
        hasActiveEncryptionSession,
        selectedCalendar,
      }),
    [
      enabledNotificationCount,
      hasActiveEncryptionSession,
      localSettings?.eventEncryptionMode,
      selectedCalendar,
    ],
  );
  const badgeItem = selectedEvent?.id ? selectedEvent : previewBadgeItem;
  const dialogTitle = !selectedEvent?.id
    ? "Create Event"
    : isViewMode
      ? "Event Details"
      : "Edit Event";
  const recurringModal = selectedEvent && (
    <RecurringDeleteModal
      open={showRecurringDeleteModal}
      onOpenChange={setShowRecurringDeleteModal}
      eventTitle={selectedEvent.title}
      onDeleteThis={handleRecurringDeleteThis}
      onDeleteAll={handleRecurringDeleteAll}
      loading={eventSaving}
    />
  );

  const standardLeadingSlot = selectedEvent?.id ? (
    <button
      onClick={() => onOpenChange(false)}
      className="p-1 rounded hover:bg-muted/50 transition-colors cursor-pointer"
    >
      <ArrowLeft className="size-4 text-muted-foreground" />
    </button>
  ) : (
    <Plus className="size-4 text-muted-foreground ml-1" />
  );
  const embeddedLeadingSlot = (
    <button
      onClick={onBack}
      className="p-1 rounded hover:bg-muted/50 transition-colors cursor-pointer"
    >
      <ArrowLeft className="size-4 text-muted-foreground" />
    </button>
  );

  const desktopContent = (
    <>
      <EventEditorDesktopHeader
        badgeItem={badgeItem}
        dialogTitle={dialogTitle}
        isRecurring={isRecurring}
        isViewMode={isViewMode}
        leadingSlot={showBackButton ? embeddedLeadingSlot : standardLeadingSlot}
        onToggleDescription={handleToggleDescription}
        onToggleLocation={handleToggleLocation}
        onToggleNotifications={handleToggleNotifications}
        onToggleRecurring={handleToggleRecurring}
        showDescription={showDescription}
        showLocation={showLocation}
        showNotifications={showNotifications}
      />
      <EventEditorBody
        eventForm={eventForm}
        isViewMode={isViewMode}
        showLocation={showLocation}
        showDescription={showDescription}
        setShowLocation={setShowLocation}
        setShowDescription={setShowDescription}
        localSettings={localSettings}
        calendars={calendars}
        desktop
      />
      <EventEditorFooter
        canEditEvent={canEditSelectedEvent}
        isViewMode={isViewMode}
        eventForm={eventForm}
        handleEventSave={handleEventSave}
        handleEventDelete={handleEventDelete}
        handleEventDownloadIcs={handleEventDownloadIcs}
        invitationResponsePending={inviteResponsePending}
        invitationStatus={invitationStatus}
        onInvitationResponse={handleInvitationResponse}
        desktop
        onClose={() => onOpenChange(false)}
      />
    </>
  );

  if (isMobile) {
    return (
      <>
        <Drawer
          open={open}
          onOpenChange={onOpenChange}
          direction="bottom"
          modal={true}
        >
          <DrawerContent
            responsive
            responsiveHeight="92dvh"
            className="rounded-t-2xl bg-card/95 backdrop-blur-xl border-none flex flex-col gap-0 overflow-hidden pb-0 transition-[max-height,bottom] duration-200 ease-out"
          >
            <DrawerTitle className="sr-only">{dialogTitle}</DrawerTitle>
            <DrawerShell
              data-testid="mobile-event-editor-shell"
              header={
                <div className="px-5 py-3 border-b border-border/40 flex flex-row items-center shrink-0">
                  <h2 className="inline-flex items-center h-5 text-base font-semibold leading-none">
                    {dialogTitle}
                  </h2>
                  <EncryptionStatusBadge
                    item={badgeItem}
                    className="ml-1"
                    hidePlaintext={false}
                    iconSize="sm"
                  />
                </div>
              }
              footer={
                <EventEditorFooter
                  canEditEvent={canEditSelectedEvent}
                  isViewMode={isViewMode}
                  eventForm={eventForm}
                  onBack={onBack}
                  handleEventSave={handleEventSave}
                  handleEventDelete={handleEventDelete}
                  handleEventDownloadIcs={handleEventDownloadIcs}
                  invitationResponsePending={inviteResponsePending}
                  invitationStatus={invitationStatus}
                  onInvitationResponse={handleInvitationResponse}
                />
              }
              bodyClassName="min-h-0"
            >
              <div
                data-testid="mobile-event-editor-main"
                className="flex min-h-0 flex-col overflow-hidden"
              >
                <EventEditorBody
                  eventForm={eventForm}
                  isViewMode={isViewMode}
                  showLocation={showLocation}
                  showDescription={showDescription}
                  setShowLocation={setShowLocation}
                  setShowDescription={setShowDescription}
                  localSettings={localSettings}
                  calendars={calendars}
                />
              </div>
            </DrawerShell>
          </DrawerContent>
        </Drawer>
        {recurringModal}
      </>
    );
  }

  if (editorMode === "popover" && anchorPosition) {
    return (
      <EventEditorPopover
        open={open}
        onOpenChange={onOpenChange}
        anchorPosition={anchorPosition}
        badgeItem={badgeItem}
        calendars={calendars}
        dialogTitle={dialogTitle}
        eventForm={eventForm}
        handleEventSave={handleEventSave}
        handleEventDelete={handleEventDelete}
        handleEventDownloadIcs={handleEventDownloadIcs}
        canEditEvent={canEditSelectedEvent}
        invitationResponsePending={inviteResponsePending}
        invitationStatus={invitationStatus}
        isViewMode={isViewMode}
        leadingSlot={standardLeadingSlot}
        localSettings={localSettings}
        onInvitationResponse={handleInvitationResponse}
        recurringModal={recurringModal}
        setShowLocation={setShowLocation}
        setShowDescription={setShowDescription}
        showLocation={showLocation}
        showDescription={showDescription}
      />
    );
  }

  if (showBackButton) {
    return (
      <>
        {desktopContent}
        {recurringModal}
      </>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="spotlight"
        showClose={false}
        aria-describedby={undefined}
        className="overflow-hidden p-0 bg-popover border-border shadow-xl min-w-[420px] max-h-[750px] flex flex-col"
      >
        <VisuallyHidden>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </VisuallyHidden>
        {desktopContent}
      </DialogContent>
      {recurringModal}
    </Dialog>
  );
}
