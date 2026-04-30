"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { useKeyboardHeight } from "./event-editor/use-keyboard-height";
import type { EventEditorMode } from "./command-palette-context";

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
  const [showDescription, setShowDescription] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const lastPreviewPayloadRef = useRef<string>("");

  useEffect(() => {
    if (!open) {
      eventForm.resetForm();
      requestAnimationFrame(() => {
        setShowDescription(false);
        setShowLocation(false);
      });
    }
  }, [eventForm.resetForm, open]);

  useEffect(() => {
    if (!eventToEdit || !open) {
      return;
    }

    eventForm.loadEventData(eventToEdit);
    if (
      eventToEdit.id &&
      initialEventViewMode === "edit" &&
      !eventToEdit.isSynced
    ) {
      eventForm.setEventViewMode("edit");
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
    eventForm.loadEventData,
    eventForm.setEventViewMode,
    eventToEdit,
    initialEventViewMode,
    open,
  ]);

  useEffect(() => {
    if (editorMode !== "popover" || !updatePreviewEvent || !open) {
      lastPreviewPayloadRef.current = "";
      return;
    }

    const [startHours, startMinutes] = eventForm.eventStartTime
      .split(":")
      .map(Number);
    const [endHours, endMinutes] = eventForm.eventEndTime.split(":").map(Number);
    const start = new Date(eventForm.eventStartDate);
    const end = new Date(eventForm.eventEndDate);

    start.setHours(startHours || 0, startMinutes || 0, 0, 0);
    end.setHours(endHours || 0, endMinutes || 0, 0, 0);

    const payload = {
      allDay: eventForm.eventAllDay,
      calendarId: eventForm.eventCalendarId,
      description: eventForm.eventDescription || "",
      endIso: end.toISOString(),
      location: eventForm.eventLocation || "",
      startIso: start.toISOString(),
      title: eventForm.eventTitle || "(No title)",
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
    eventForm.eventAllDay,
    eventForm.eventCalendarId,
    eventForm.eventDescription,
    eventForm.eventEndDate,
    eventForm.eventEndTime,
    eventForm.eventLocation,
    eventForm.eventStartDate,
    eventForm.eventStartTime,
    eventForm.eventTitle,
    open,
    updatePreviewEvent,
  ]);

  const handleEventSave = useCallback(
    () => eventForm.handleEventSave(calendarData),
    [calendarData, eventForm],
  );
  const handleEventDelete = useCallback(
    () => eventForm.handleEventDelete(calendarData),
    [calendarData, eventForm],
  );
  const handleRecurringDeleteThis = useCallback(
    () => eventForm.handleRecurringDeleteThis(calendarData),
    [calendarData, eventForm],
  );
  const handleRecurringDeleteAll = useCallback(
    () => eventForm.handleRecurringDeleteAll(calendarData),
    [calendarData, eventForm],
  );
  const handleEventDownloadIcs = useCallback(async () => {
    if (!eventForm.selectedEvent?.id) {
      return;
    }

    try {
      await calendarApiService.downloadEventICS(eventForm.selectedEvent.id);
    } catch (error: any) {
      toast.error(error?.message || "Failed to download event as ICS file");
    }
  }, [eventForm.selectedEvent]);
  const handleToggleLocation = useCallback(() => {
    setShowLocation((current) => !current);
  }, []);
  const handleToggleDescription = useCallback(() => {
    setShowDescription((current) => !current);
  }, []);
  const handleToggleRecurring = useCallback(() => {
    eventForm.setIsRecurring(!eventForm.isRecurring);
  }, [eventForm]);
  const handleToggleNotifications = useCallback(() => {
    eventForm.setShowNotifications(!eventForm.showNotifications);
  }, [eventForm]);

  const isViewMode = eventForm.eventViewMode === "view";
  const isMobile = useIsMobile();
  const keyboardHeight = useKeyboardHeight();
  const selectedCalendar = useMemo(
    () => calendars.find((calendar) => calendar.id === eventForm.eventCalendarId),
    [calendars, eventForm.eventCalendarId],
  );
  const enabledNotificationCount = useMemo(
    () =>
      eventForm.eventNotifications.filter((notification) => notification.isEnabled)
        .length,
    [eventForm.eventNotifications],
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
  const badgeItem = eventForm.selectedEvent?.id
    ? eventForm.selectedEvent
    : previewBadgeItem;
  const dialogTitle = !eventForm.selectedEvent?.id
    ? "Create Event"
    : isViewMode
      ? "Event Details"
      : "Edit Event";
  const recurringModal = eventForm.selectedEvent && (
    <RecurringDeleteModal
      open={eventForm.showRecurringDeleteModal}
      onOpenChange={eventForm.setShowRecurringDeleteModal}
      eventTitle={eventForm.selectedEvent.title}
      onDeleteThis={handleRecurringDeleteThis}
      onDeleteAll={handleRecurringDeleteAll}
      loading={eventForm.eventSaving}
    />
  );

  const standardLeadingSlot = eventForm.selectedEvent?.id ? (
    <button
      onClick={() => onOpenChange(false)}
      className="p-1 rounded hover:bg-muted/50 transition-colors cursor-pointer"
    >
      <ArrowLeft className="h-4 w-4 text-muted-foreground" />
    </button>
  ) : (
    <Plus className="h-4 w-4 text-muted-foreground ml-1" />
  );
  const embeddedLeadingSlot = (
    <button
      onClick={onBack}
      className="p-1 rounded hover:bg-muted/50 transition-colors cursor-pointer"
    >
      <ArrowLeft className="h-4 w-4 text-muted-foreground" />
    </button>
  );

  const desktopContent = (
    <>
      <EventEditorDesktopHeader
        badgeItem={badgeItem}
        dialogTitle={dialogTitle}
        isRecurring={eventForm.isRecurring}
        isViewMode={isViewMode}
        leadingSlot={showBackButton ? embeddedLeadingSlot : standardLeadingSlot}
        onToggleDescription={handleToggleDescription}
        onToggleLocation={handleToggleLocation}
        onToggleNotifications={handleToggleNotifications}
        onToggleRecurring={handleToggleRecurring}
        showDescription={showDescription}
        showLocation={showLocation}
        showNotifications={eventForm.showNotifications}
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
        isViewMode={isViewMode}
        eventForm={eventForm}
        handleEventSave={handleEventSave}
        handleEventDelete={handleEventDelete}
        handleEventDownloadIcs={handleEventDownloadIcs}
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
            className="rounded-t-2xl bg-card/95 backdrop-blur-xl border-none flex flex-col gap-0 overflow-hidden pb-0 transition-[max-height,bottom] duration-200 ease-out"
            style={{
              maxHeight:
                keyboardHeight > 0
                  ? `calc(100dvh - ${keyboardHeight}px)`
                  : "92dvh",
              bottom: keyboardHeight,
            }}
          >
            <DrawerTitle className="sr-only">{dialogTitle}</DrawerTitle>
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
            <EventEditorFooter
              isViewMode={isViewMode}
              eventForm={eventForm}
              onBack={onBack}
              handleEventSave={handleEventSave}
              handleEventDelete={handleEventDelete}
              handleEventDownloadIcs={handleEventDownloadIcs}
            />
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
        isViewMode={isViewMode}
        leadingSlot={standardLeadingSlot}
        localSettings={localSettings}
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