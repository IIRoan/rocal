"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import type {
  CalendarEvent,
  Calendar,
} from "@workspace/ui/components/calendar";
import { format } from "date-fns";
import type { UserSettings } from "@/lib/types/calendar";
import {
  NotificationManager,
  formatEventDescription,
  EncryptionStatusBadge,
  getEncryptionStatusMeta,
} from "@workspace/ui/components/calendar";
import { getColorSwatchValue } from "@workspace/ui/components/calendar";
import { RecurringEventForm } from "./command-palette/recurring-event-form";
import { RecurringDeleteModal } from "./command-palette/recurring-delete-modal";
import { useEventForm } from "@/hooks/use-event-form";
import { calendarApiService } from "@/lib/calendar-api-service";
import { ShadcnAutocomleteTimePicker } from "@workspace/ui/components/ui/autocompletetimepicker";
import { toast } from "sonner";
import { getActiveE2eeSession } from "@/lib/e2ee-session";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function SyncedEventInfoBadge() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Synced from external calendar"
          className="inline-flex items-center justify-center h-5 w-5 rounded-md text-foreground/60 hover:text-foreground hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <RefreshCw className="h-3 w-3" strokeWidth={2.25} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-72 p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-3.5 py-3 border-b border-border/60">
          <div className="flex items-center justify-center h-8 w-8 shrink-0 rounded-md bg-foreground/5 text-foreground/70">
            <RefreshCw className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium leading-tight">
              Synced event
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              This event is mirrored from an external calendar provider.
            </p>
          </div>
        </div>
        <div className="px-3.5 py-3 space-y-2.5">
          <div className="flex items-start gap-2.5">
            <CloudDownload
              className="h-3.5 w-3.5 mt-0.5 text-foreground/70 shrink-0"
              aria-hidden
            />
            <div className="min-w-0">
              <div className="text-xs font-medium leading-tight">
                Source of truth lives elsewhere
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                Changes made on the original provider flow back into Rocal on
                the next sync.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Server
              className="h-3.5 w-3.5 mt-0.5 text-foreground/70 shrink-0"
              aria-hidden
            />
            <div className="min-w-0">
              <div className="text-xs font-medium leading-tight">
                Stored on Rocal during sync
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                Title, time, location and description are pulled in so we can
                render the event and trigger reminders.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <PenOff
              className="h-3.5 w-3.5 mt-0.5 text-foreground/70 shrink-0"
              aria-hidden
            />
            <div className="min-w-0">
              <div className="text-xs font-medium leading-tight">
                Edits may not push back
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                Depending on the provider, changes you make here can be
                overwritten on the next sync.
              </p>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatReminderMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) {
    const hours = minutes / 60;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hour${hours === 1 ? "" : "s"}`;
  }
  if (minutes < 10080) {
    const days = minutes / 1440;
    return `${Number.isInteger(days) ? days : days.toFixed(1)} day${days === 1 ? "" : "s"}`;
  }
  const weeks = minutes / 10080;
  return `${Number.isInteger(weeks) ? weeks : weeks.toFixed(1)} week${weeks === 1 ? "" : "s"}`;
}

// Hook to track keyboard visibility on mobile
function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined" || !("visualViewport" in window)) {
      return;
    }

    const visualViewport = window.visualViewport as VisualViewport;
    let rafId: number;

    const handleResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const viewportHeight = visualViewport.height;
        const windowHeight = window.innerHeight;
        const kbHeight = Math.max(0, windowHeight - viewportHeight);
        setKeyboardHeight(kbHeight);
      });
    };

    visualViewport.addEventListener("resize", handleResize);
    visualViewport.addEventListener("scroll", handleResize);
    handleResize();

    return () => {
      cancelAnimationFrame(rafId);
      visualViewport.removeEventListener("resize", handleResize);
      visualViewport.removeEventListener("scroll", handleResize);
    };
  }, []);

  return keyboardHeight;
}

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { VisuallyHidden } from "@workspace/ui/components/ui/visually-hidden";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@workspace/ui/components/ui/drawer";
import { usePrefersReducedMotion } from "@workspace/ui/hooks";
import { useIsMobile } from "@workspace/ui/hooks/use-mobile";
import { gsap } from "@workspace/ui/lib/gsap";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { Textarea } from "@workspace/ui/components/ui/textarea";
import { Button } from "@workspace/ui/components/ui/button";
import { Checkbox } from "@workspace/ui/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import { Calendar as CalendarUI } from "@workspace/ui/components/ui/calendar";
import { Switch } from "@workspace/ui/components/ui/switch";
import {
  Bell,
  RotateCcw,
  CalendarIcon,
  FileText,
  MapPin,
  Edit3,
  Save,
  Trash2,
  Loader2,
  Clock,
  X,
  Plus,
  ArrowLeft,
  ChevronRight,
  Download,
  RefreshCw,
  CloudDownload,
  Server,
  PenOff,
  ShieldCheck,
} from "lucide-react";

import type { EventEditorMode } from "./command-palette-context";
import { createPortal } from "react-dom";

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

  // Use the event form hook for all form logic
  const eventForm = useEventForm({
    calendars,
    localSettings,
    onEventSaved,
    onClose: () => onOpenChange(false),
  });

  // Local UI state for progressive disclosure
  const [showDescription, setShowDescription] = useState(false);
  const [showLocation, setShowLocation] = useState(false);

  // Reset form when dialog is closed
  useEffect(() => {
    if (!open) {
      eventForm.resetForm();
      setShowDescription(false);
      setShowLocation(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Load event data when eventToEdit changes
  useEffect(() => {
    if (eventToEdit && open) {
      eventForm.loadEventData(eventToEdit);
      if (
        eventToEdit.id &&
        initialEventViewMode === "edit" &&
        !eventToEdit.isSynced
      ) {
        eventForm.setEventViewMode("edit");
      }
      // Auto-expand fields if they have data
      if (eventToEdit.description) setShowDescription(true);
      if (eventToEdit.location) setShowLocation(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventToEdit, open, initialEventViewMode]);

  // Sync form changes to preview event in real-time (popover mode only)
  // Guard against infinite loops by diff-checking the outgoing payload
  const lastPreviewPayloadRef = React.useRef<string>("");
  useEffect(() => {
    if (editorMode !== "popover" || !updatePreviewEvent || !open) {
      lastPreviewPayloadRef.current = "";
      return;
    }

    const [startH, startM] = eventForm.eventStartTime.split(":").map(Number);
    const [endH, endM] = eventForm.eventEndTime.split(":").map(Number);

    const start = new Date(eventForm.eventStartDate);
    start.setHours(startH || 0, startM || 0, 0, 0);

    const end = new Date(eventForm.eventEndDate);
    end.setHours(endH || 0, endM || 0, 0, 0);

    const payload = {
      title: eventForm.eventTitle || "(No title)",
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      allDay: eventForm.eventAllDay,
      calendarId: eventForm.eventCalendarId,
      location: eventForm.eventLocation || "",
      description: eventForm.eventDescription || "",
    };

    const payloadKey = JSON.stringify(payload);
    if (payloadKey === lastPreviewPayloadRef.current) return;
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
    updatePreviewEvent,
    open,
    eventForm.eventTitle,
    eventForm.eventStartDate,
    eventForm.eventEndDate,
    eventForm.eventStartTime,
    eventForm.eventEndTime,
    eventForm.eventAllDay,
    eventForm.eventCalendarId,
    eventForm.eventLocation,
    eventForm.eventDescription,
  ]);

  // Use hook handlers
  const handleEventSave = () => eventForm.handleEventSave(calendarData);
  const handleEventDelete = () => eventForm.handleEventDelete(calendarData);
  const handleRecurringDeleteThis = () =>
    eventForm.handleRecurringDeleteThis(calendarData);
  const handleRecurringDeleteAll = () =>
    eventForm.handleRecurringDeleteAll(calendarData);
  const handleEventDownloadIcs = useCallback(async () => {
    if (!eventForm.selectedEvent?.id) {
      return;
    }

    try {
      await calendarApiService.downloadEventICS(eventForm.selectedEvent.id);
    } catch (error: any) {
      const errorMessage =
        error?.message || "Failed to download event as ICS file";
      toast.error(errorMessage);
    }
  }, [eventForm.selectedEvent?.id]);

  const isViewMode = eventForm.eventViewMode === "view";
  const isMobile = useIsMobile();
  const keyboardHeight = useKeyboardHeight();

  // Encryption outcome preview — used in headers for new events
  const _encSelCal = React.useMemo(
    () => calendars.find((c) => c.id === eventForm.eventCalendarId),
    [calendars, eventForm.eventCalendarId],
  );
  const _encHasSession = React.useMemo(() => getActiveE2eeSession() !== null, []);
  const _encNotifCount = React.useMemo(
    () => eventForm.eventNotifications.filter((n) => n.isEnabled).length,
    [eventForm.eventNotifications],
  );
  const encPreviewItem = React.useMemo(() => {
    if (!_encHasSession) return { encryptionState: "plaintext" as const };
    if (_encSelCal?.forceFullEncryption) return { forceFullEncryption: true };
    if (localSettings?.eventEncryptionMode === "full") return { encryptionState: "encrypted" as const };
    if (_encNotifCount > 0) return { encryptionState: "shadow_write" as const };
    return { encryptionState: "encrypted" as const };
  }, [_encHasSession, _encSelCal, localSettings, _encNotifCount]);
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
                item={eventForm.selectedEvent?.id ? eventForm.selectedEvent : encPreviewItem}
                className="ml-1"
                hidePlaintext={false}
                iconSize="sm"
              />
            </div>
            <MobileEventEditorBody
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

  // Desktop popover mode — render a floating panel near the click position
  if (editorMode === "popover" && anchorPosition) {
    return (
      <EventEditorPopover
        open={open}
        onOpenChange={onOpenChange}
        anchorPosition={anchorPosition}
        dialogTitle={dialogTitle}
        eventForm={eventForm}
        isViewMode={isViewMode}
        showLocation={showLocation}
        showDescription={showDescription}
        setShowLocation={setShowLocation}
        setShowDescription={setShowDescription}
        localSettings={localSettings}
        calendars={calendars}
        onBack={onBack}
        handleEventSave={handleEventSave}
        handleEventDelete={handleEventDelete}
        handleEventDownloadIcs={handleEventDownloadIcs}
        recurringModal={recurringModal}
      />
    );
  }

  // Desktop modal mode (default)
  // When embedded in command palette (showBackButton), return content without Dialog
  if (showBackButton) {
    return (
      <>
        {/* Header - command palette style with option toggles */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 shrink-0">
          <button
            onClick={onBack}
            className="p-1 rounded hover:bg-muted/50 transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <span className="inline-flex items-center h-5 text-sm font-medium leading-none">
            {dialogTitle}
          </span>
          <EncryptionStatusBadge
            item={eventForm.selectedEvent?.id ? eventForm.selectedEvent : encPreviewItem}
            className="ml-1"
            hidePlaintext={false}
            iconSize="sm"
          />
          <div className="flex-1" />
          {/* Option toggles in header - disabled in view mode */}
          {!isViewMode && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowLocation(!showLocation)}
                className={`p-1.5 rounded transition-colors cursor-pointer ${showLocation ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
                title="Location"
              >
                <MapPin className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowDescription(!showDescription)}
                className={`p-1.5 rounded transition-colors cursor-pointer ${showDescription ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
                title="Description"
              >
                <FileText className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => eventForm.setIsRecurring(!eventForm.isRecurring)}
                className={`p-1.5 rounded transition-colors cursor-pointer ${eventForm.isRecurring ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
                title="Repeat"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  eventForm.setShowNotifications(!eventForm.showNotifications)
                }
                className={`p-1.5 rounded transition-colors cursor-pointer ${eventForm.showNotifications ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
                title="Reminder"
              >
                <Bell className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        <MobileEventEditorBody
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
          onBack={onBack}
          handleEventSave={handleEventSave}
          handleEventDelete={handleEventDelete}
          handleEventDownloadIcs={handleEventDownloadIcs}
          desktop
          onClose={() => onOpenChange(false)}
        />
        {recurringModal}
      </>
    );
  }

  // Standalone desktop modal mode (from event-editor view, clicking existing event etc.)
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
        {/* Header - command palette style with option toggles */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 shrink-0">
          {eventForm.selectedEvent?.id ? (
            <button
              onClick={() => onOpenChange(false)}
              className="p-1 rounded hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
          ) : (
            <Plus className="h-4 w-4 text-muted-foreground ml-1" />
          )}
          <span className="inline-flex items-center h-5 text-sm font-medium leading-none">
            {dialogTitle}
          </span>
          <EncryptionStatusBadge
            item={eventForm.selectedEvent?.id ? eventForm.selectedEvent : encPreviewItem}
            className="ml-1"
            hidePlaintext={false}
            iconSize="sm"
          />
          <div className="flex-1" />
          {/* Option toggles in header - disabled in view mode */}
          {!isViewMode && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowLocation(!showLocation)}
                className={`p-1.5 rounded transition-colors cursor-pointer ${showLocation ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
                title="Location"
              >
                <MapPin className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowDescription(!showDescription)}
                className={`p-1.5 rounded transition-colors cursor-pointer ${showDescription ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
                title="Description"
              >
                <FileText className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => eventForm.setIsRecurring(!eventForm.isRecurring)}
                className={`p-1.5 rounded transition-colors cursor-pointer ${eventForm.isRecurring ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
                title="Repeat"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  eventForm.setShowNotifications(!eventForm.showNotifications)
                }
                className={`p-1.5 rounded transition-colors cursor-pointer ${eventForm.showNotifications ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
                title="Reminder"
              >
                <Bell className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        <MobileEventEditorBody
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
          onBack={onBack}
          handleEventSave={handleEventSave}
          handleEventDelete={handleEventDelete}
          handleEventDownloadIcs={handleEventDownloadIcs}
          desktop
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
      {recurringModal}
    </Dialog>
  );
}

// ─── Popover Editor (Desktop timeline click) ─────────────────────────────────

interface EventEditorPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorPosition: { x: number; y: number };
  dialogTitle: string;
  eventForm: ReturnType<typeof useEventForm>;
  isViewMode: boolean;
  showLocation: boolean;
  showDescription: boolean;
  setShowLocation: (v: boolean) => void;
  setShowDescription: (v: boolean) => void;
  localSettings: UserSettings;
  calendars: Calendar[];
  onBack: () => void;
  handleEventSave: () => void;
  handleEventDelete: () => void;
  handleEventDownloadIcs: () => void;
  recurringModal: React.ReactNode;
}

function EventEditorPopover({
  open,
  onOpenChange,
  anchorPosition,
  dialogTitle,
  eventForm,
  isViewMode,
  showLocation,
  showDescription,
  setShowLocation,
  setShowDescription,
  localSettings,
  calendars,
  onBack,
  handleEventSave,
  handleEventDelete,
  handleEventDownloadIcs,
  recurringModal,
}: EventEditorPopoverProps) {
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  // Encryption outcome preview for the header icon
  const _encSelectedCalendar = React.useMemo(
    () => calendars.find((c) => c.id === eventForm.eventCalendarId),
    [calendars, eventForm.eventCalendarId],
  );
  const _encHasSession = React.useMemo(
    () => getActiveE2eeSession() !== null,
    [],
  );
  const _encNotifCount = React.useMemo(
    () => eventForm.eventNotifications.filter((n) => n.isEnabled).length,
    [eventForm.eventNotifications],
  );
  const _encPreview = React.useMemo(() => {
    if (!_encHasSession) return { encryptionState: "plaintext" as const };
    if (_encSelectedCalendar?.forceFullEncryption) return { forceFullEncryption: true };
    if (localSettings?.eventEncryptionMode === "full") return { encryptionState: "encrypted" as const };
    if (_encNotifCount > 0) return { encryptionState: "shadow_write" as const };
    return { encryptionState: "encrypted" as const };
  }, [_encHasSession, _encSelectedCalendar, localSettings, _encNotifCount]);
  const _encMeta = React.useMemo(
    () => getEncryptionStatusMeta(_encPreview),
    [_encPreview],
  );
  const _encHint = !_encHasSession
    ? "Unlock encryption on this device to store this event encrypted."
    : _encSelectedCalendar?.forceFullEncryption
      ? "This calendar forces ciphertext-only storage."
      : localSettings?.eventEncryptionMode === "full"
        ? "Your current setting stores this event as ciphertext only."
        : _encNotifCount > 0
          ? "Enabled reminders keep a hybrid plaintext shadow for delivery."
          : "No reminder shadow needed — this event will be stored as ciphertext only.";

  // Calculate position synchronously before paint to avoid flash
  // useLayoutEffect runs before browser paint, so position is set before first render
  const [position, setPosition] = React.useState<{
    top: number;
    left: number;
    maxHeight: number;
  } | null>(null);
  const positionRef = React.useRef<{
    top: number;
    left: number;
    maxHeight: number;
  } | null>(null);
  const appliedPositionRef = React.useRef<{
    top: number;
    left: number;
    maxHeight: number;
  } | null>(null);
  const allowPositionAnimationRef = React.useRef(false);

  // Calculate position synchronously - runs before paint. We retry on the
  // next animation frame and again ~80ms later in case the preview event
  // hasn't been mounted/measured yet (DnD overlays, suspense, etc.).
  React.useLayoutEffect(() => {
    if (!open || !anchorPosition) {
      if (!open) {
        setPosition(null);
        positionRef.current = null;
      }
      return;
    }

    const POPOVER_WIDTH = 420;
    const POPOVER_MAX_HEIGHT = 750;
    const POPOVER_MIN_HEIGHT = 320;
    const VIEWPORT_PADDING = 16;
    const GAP = 12;

    const compute = () => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const previewEl = document.querySelector(
        "[data-preview-event='true']",
      ) as HTMLElement | null;

      if (!previewEl) {
        return false;
      }

      const rect = previewEl.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return false;
      }

      let left: number;
      let top: number;
      const spaceRight = viewportWidth - rect.right - GAP - VIEWPORT_PADDING;
      const spaceLeft = rect.left - GAP - VIEWPORT_PADDING;

      // Prefer right side; flip to left if it doesn't fit; otherwise pin to
      // the viewport edge on the roomier side, but never overlap the preview.
      if (spaceRight >= POPOVER_WIDTH) {
        left = rect.right + GAP;
      } else if (spaceLeft >= POPOVER_WIDTH) {
        left = rect.left - POPOVER_WIDTH - GAP;
      } else if (spaceRight >= spaceLeft) {
        left = viewportWidth - POPOVER_WIDTH - VIEWPORT_PADDING;
      } else {
        left = VIEWPORT_PADDING;
      }

      top = rect.top;

      // Vertical placement: anchor to preview top, but if the popover's actual
      // content would overflow the viewport bottom, grow upward by shifting
      // top up — keeps the popover's bottom edge near the preview/viewport
      // bottom. Only when content exceeds the entire viewport do we cap
      // max-height and let the body scroll.
      const bottomLimit = viewportHeight - VIEWPORT_PADDING;
      const viewportMax = viewportHeight - VIEWPORT_PADDING * 2;

      // Measure NATURAL content height (ignoring our own max-height clamp) so
      // growth is content-driven. The popover wraps three flex children:
      // header (shrink-0), body (overflow-y-auto), footer (shrink-0). Summing
      // header.offsetHeight + body.scrollHeight + footer.offsetHeight gives the
      // true unclamped content size.
      let measured = 0;
      const root = popoverRef.current;
      if (root) {
        const children = Array.from(root.children) as HTMLElement[];
        for (const child of children) {
          const isScrollable =
            getComputedStyle(child).overflowY !== "visible" &&
            child.scrollHeight > child.clientHeight;
          measured += isScrollable ? child.scrollHeight : child.offsetHeight;
        }
        // Fallback if measurement returned 0 (very first paint)
        if (measured === 0) measured = root.offsetHeight;
        // Compensate for the popover chrome (borders) so we don't end up with
        // a 1-2px internal overflow that produces a tiny scrollbar.
        measured += root.offsetHeight - root.clientHeight + 2;
      }
      const desiredHeight = Math.min(
        POPOVER_MAX_HEIGHT,
        Math.max(measured, POPOVER_MIN_HEIGHT),
      );

      let maxHeight = Math.min(desiredHeight, viewportMax);

      if (top + maxHeight > bottomLimit) {
        // Shift the top upward so the bottom hugs the viewport edge.
        top = bottomLimit - maxHeight;
      }
      if (top < VIEWPORT_PADDING) {
        top = VIEWPORT_PADDING;
        maxHeight = Math.min(maxHeight, bottomLimit - top);
      }

      const newPos = { top, left, maxHeight };
      const prev = positionRef.current;
      if (
        !prev ||
        prev.top !== newPos.top ||
        prev.left !== newPos.left ||
        prev.maxHeight !== newPos.maxHeight
      ) {
        positionRef.current = newPos;
        setPosition(newPos);
      }
      return true;
    };

    compute();
    const raf = requestAnimationFrame(compute);
    const t = window.setTimeout(compute, 80);
    // Recompute on resize so the popover stays clamped to the viewport
    const onResize = () => compute();
    window.addEventListener("resize", onResize);
    // Recompute when popover content height changes (toggling
    // location/description/recurrence/reminder sections). We observe the
    // outer popover AND its children — when content grows past max-height,
    // the outer size stays clamped but the inner body's scrollHeight changes,
    // so observing the body (and its children) is what triggers a re-layout.
    let ro: ResizeObserver | null = null;
    if (popoverRef.current && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => compute());
      ro.observe(popoverRef.current);
      for (const child of Array.from(popoverRef.current.children)) {
        ro.observe(child);
        for (const grand of Array.from(child.children)) {
          ro.observe(grand);
        }
      }
    }
    let mo: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
      mo = new MutationObserver(() => {
        compute();
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      window.removeEventListener("resize", onResize);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [open, anchorPosition, showLocation, showDescription]);

  React.useEffect(() => {
    if (!open) {
      allowPositionAnimationRef.current = false;
      return;
    }

    allowPositionAnimationRef.current = false;
    const t = window.setTimeout(() => {
      allowPositionAnimationRef.current = true;
    }, 180);

    return () => {
      window.clearTimeout(t);
      allowPositionAnimationRef.current = false;
    };
  }, [open]);

  React.useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!open || !position || !popover) {
      appliedPositionRef.current = null;
      return;
    }

    const previous = appliedPositionRef.current;

    if (
      !previous ||
      prefersReducedMotion ||
      !allowPositionAnimationRef.current
    ) {
      gsap.set(popover, {
        top: position.top,
        left: position.left,
        maxHeight: position.maxHeight,
      });
    } else if (
      previous.top !== position.top ||
      previous.left !== position.left ||
      previous.maxHeight !== position.maxHeight
    ) {
      gsap.killTweensOf(popover);
      gsap.fromTo(
        popover,
        {
          top: previous.top,
          left: previous.left,
          maxHeight: previous.maxHeight,
        },
        {
          top: position.top,
          left: position.left,
          maxHeight: position.maxHeight,
          duration: 0.22,
          ease: "power2.out",
          overwrite: "auto",
        },
      );
    }

    appliedPositionRef.current = position;

    return () => {
      gsap.killTweensOf(popover);
    };
  }, [open, position, prefersReducedMotion]);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [open, onOpenChange]);

  // Close on click outside
  React.useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        // Don't close if clicking on a select dropdown or popover content (date pickers etc.)
        const target = e.target as HTMLElement;
        if (
          target.closest("[data-radix-popper-content-wrapper]") ||
          target.closest("[role='listbox']") ||
          target.closest("[role='dialog']")
        ) {
          return;
        }
        onOpenChange(false);
      }
    };
    // Use a small delay to avoid closing immediately from the same click that opened it
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, onOpenChange]);

  // Don't render until we have calculated position (prevents flash at wrong position)
  if (!open || !position) return null;

  return createPortal(
    <>
      {/* Subtle backdrop */}
      <div className="fixed inset-0 z-50" onClick={() => onOpenChange(false)} />
      {/* Popover panel - command palette style */}
      <div
        ref={popoverRef}
        className="fixed z-50 w-[420px] bg-popover border border-border shadow-xl rounded-lg flex flex-col overflow-hidden"
        style={{
          top: position?.top ?? 0,
          left: position?.left ?? 0,
          maxHeight: position?.maxHeight ?? 750,
        }}
      >
        {/* Header - command palette style with option toggles */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 shrink-0">
          {eventForm.selectedEvent?.id ? (
            <button
              onClick={() => onOpenChange(false)}
              className="p-1 rounded hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
          ) : (
            <Plus className="h-4 w-4 text-muted-foreground ml-1" />
          )}
          <span className="inline-flex items-center h-5 text-sm font-medium leading-none">
            {dialogTitle}
          </span>
          <EncryptionStatusBadge
            item={eventForm.selectedEvent?.id ? eventForm.selectedEvent : _encPreview}
            className="ml-0"
            hidePlaintext={false}
            iconSize="sm"
          />
          <div className="flex-1" />
          {/* Option toggles in header - disabled in view mode */}
          {!isViewMode && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowLocation(!showLocation)}
                className={`p-1.5 rounded transition-colors cursor-pointer ${showLocation ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
                title="Location"
              >
                <MapPin className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowDescription(!showDescription)}
                className={`p-1.5 rounded transition-colors cursor-pointer ${showDescription ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
                title="Description"
              >
                <FileText className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => eventForm.setIsRecurring(!eventForm.isRecurring)}
                className={`p-1.5 rounded transition-colors cursor-pointer ${eventForm.isRecurring ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
                title="Repeat"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  eventForm.setShowNotifications(!eventForm.showNotifications)
                }
                className={`p-1.5 rounded transition-colors cursor-pointer ${eventForm.showNotifications ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
                title="Reminder"
              >
                <Bell className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        {/* Body */}
        <MobileEventEditorBody
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
        {/* Footer */}
        <EventEditorFooter
          isViewMode={isViewMode}
          eventForm={eventForm}
          onBack={onBack}
          handleEventSave={handleEventSave}
          handleEventDelete={handleEventDelete}
          handleEventDownloadIcs={handleEventDownloadIcs}
          desktop
          onClose={() => onOpenChange(false)}
        />
      </div>
      {recurringModal}
    </>,
    document.body,
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface BodyProps {
  eventForm: ReturnType<typeof useEventForm>;
  isViewMode: boolean;
  showLocation: boolean;
  showDescription: boolean;
  setShowLocation: (v: boolean) => void;
  setShowDescription: (v: boolean) => void;
  localSettings: UserSettings | null | undefined;
  calendars: Calendar[];
  desktop?: boolean;
}

function MobileEventEditorBody({
  eventForm,
  isViewMode,
  showLocation,
  showDescription,
  setShowLocation,
  setShowDescription,
  localSettings,
  calendars,
  desktop,
}: BodyProps) {
  const selectedCalendar = React.useMemo(
    () => calendars.find((calendar) => calendar.id === eventForm.eventCalendarId),
    [calendars, eventForm.eventCalendarId],
  );
  const enabledNotificationCount = React.useMemo(
    () => eventForm.eventNotifications.filter((n) => n.isEnabled).length,
    [eventForm.eventNotifications],
  );
  const hasActiveEncryptionSession = React.useMemo(
    () => getActiveE2eeSession() !== null,
    [],
  );
  const encryptionPreview = React.useMemo(() => {
    if (!hasActiveEncryptionSession) {
      return { encryptionState: "plaintext" as const };
    }

    if (selectedCalendar?.forceFullEncryption) {
      return { forceFullEncryption: true };
    }

    if (localSettings?.eventEncryptionMode === "full") {
      return { encryptionState: "encrypted" as const };
    }

    if (enabledNotificationCount > 0) {
      return { encryptionState: "shadow_write" as const };
    }

    return { encryptionState: "encrypted" as const };
  }, [
    enabledNotificationCount,
    hasActiveEncryptionSession,
    localSettings?.eventEncryptionMode,
    selectedCalendar?.forceFullEncryption,
  ]);
  const encryptionMeta = React.useMemo(
    () => getEncryptionStatusMeta(encryptionPreview),
    [encryptionPreview],
  );
  const encryptionHint = !hasActiveEncryptionSession
    ? "Unlock encryption on this device to store this event encrypted."
    : selectedCalendar?.forceFullEncryption
      ? "This calendar forces ciphertext-only storage."
      : localSettings?.eventEncryptionMode === "full"
        ? "Your current setting stores this event as ciphertext only."
        : enabledNotificationCount > 0
          ? "Enabled reminders keep a hybrid plaintext shadow for delivery."
          : "No reminder shadow is needed, so this event will be stored as ciphertext only.";
  const bodyClass = desktop
    ? "px-3 py-2 space-y-3 flex-1 overflow-y-auto min-h-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar]:h-0"
    : "p-4 space-y-4 flex-1 overflow-y-auto custom-scrollbar";

  return (
    <div className={bodyClass}>
      {isViewMode ? (
        /* VIEW MODE - command palette style list */
        <div className="py-1.5">
          {/* Title row */}
          <div className="px-2">
            <div className="flex items-center gap-3 px-2 py-2.5">
              <div className="flex items-center justify-center w-6 h-6 shrink-0">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="text-sm font-medium truncate flex-1 min-w-0">
                {eventForm.eventTitle || "Untitled Event"}
              </span>
              {eventForm.selectedEvent?.id && eventForm.selectedEvent.isSynced && (
                <div className="flex items-center gap-1 shrink-0">
                  <SyncedEventInfoBadge />
                </div>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border/50 mx-4 my-0.5" />

          {/* Details list */}
          <div className="px-2 py-1 space-y-0.5">
            {/* Date & Time */}
            <div className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent/30 transition-colors">
              <div className="flex items-center justify-center w-6 h-6 shrink-0">
                <Clock className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0 leading-tight">
                <div className="text-sm">
                  {(() => {
                    const startStr = format(
                      eventForm.eventStartDate,
                      "EEEE, MMMM d, yyyy",
                    );
                    const endStr = format(
                      eventForm.eventEndDate,
                      "EEEE, MMMM d, yyyy",
                    );
                    const isSameDay = startStr === endStr;

                    if (isSameDay) {
                      return startStr;
                    }
                    return (
                      <>
                        {format(eventForm.eventStartDate, "EEE, MMM d")}
                        <span className="text-muted-foreground mx-1">→</span>
                        {format(eventForm.eventEndDate, "EEE, MMM d, yyyy")}
                      </>
                    );
                  })()}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {!eventForm.eventAllDay
                    ? `${eventForm.eventStartTime} – ${eventForm.eventEndTime}`
                    : "All day"}
                </div>
              </div>
            </div>

            {/* Calendar */}
            <div className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent/30 transition-colors">
              <div className="flex items-center justify-center w-6 h-6 shrink-0">
                <span
                  className="h-3 w-3 rounded-full ring-1 ring-border/60"
                  style={{
                    backgroundColor: getColorSwatchValue(
                      calendars.find(
                        (c) => c.id === eventForm.eventCalendarId,
                      )?.color || "blue",
                    ),
                  }}
                  aria-hidden
                />
              </div>
              <span className="text-sm truncate flex-1 min-w-0">
                {calendars.find((c) => c.id === eventForm.eventCalendarId)
                  ?.name || "Unknown Calendar"}
              </span>
            </div>

            {/* Reminders – email */}
            {(() => {
              const emailReminders = (eventForm.eventNotifications ?? [])
                .filter((n) => n.isEnabled !== false)
                .map((n) => n.minutesBefore)
                .sort((a, b) => a - b);

              if (
                eventForm.notificationsLoading ||
                emailReminders.length > 0
              ) {
                return (
                  <div className="flex items-start gap-3 px-2 py-2 rounded-md hover:bg-accent/30 transition-colors">
                    <div className="flex items-center justify-center w-6 h-6 shrink-0 mt-0.5">
                      <Bell className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      {emailReminders.map((minutes, idx) => (
                        <div
                          key={`email-reminder-${idx}-${minutes}`}
                          className="flex items-baseline gap-2 text-sm leading-tight"
                        >
                          <span>
                            {formatReminderMinutes(minutes)} before
                          </span>
                          <span className="text-xs text-muted-foreground">
                            email
                          </span>
                        </div>
                      ))}
                      {eventForm.notificationsLoading &&
                        emailReminders.length === 0 && (
                          <span className="text-xs text-muted-foreground">
                            Loading reminders…
                          </span>
                        )}
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {/* Location - only if set */}
            {eventForm.eventLocation && (
              <div className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent/30 transition-colors">
                <div className="flex items-center justify-center w-6 h-6 shrink-0">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                </div>
                <span className="text-sm truncate">
                  {eventForm.eventLocation}
                </span>
              </div>
            )}

            {/* Description - only if set */}
            {eventForm.eventDescription && (
              <div className="flex items-start gap-3 px-2 py-2 rounded-md hover:bg-accent/30 transition-colors">
                <div className="flex items-center justify-center w-6 h-6 shrink-0 mt-0.5">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
                <span className="text-sm whitespace-pre-wrap flex-1 min-w-0">
                  {formatEventDescription(eventForm.eventDescription)}
                </span>
              </div>
            )}

            {/* Recurrence - only if set */}
            {eventForm.isRecurring && eventForm.recurrenceRule && (
              <div className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent/30 transition-colors">
                <div className="flex items-center justify-center w-6 h-6 shrink-0">
                  <RotateCcw className="h-4 w-4 text-muted-foreground" />
                </div>
                <span className="text-sm">
                  {(() => {
                    const { frequency, interval, count, until, byWeekDay } =
                      eventForm.recurrenceRule!;
                    let description = "";
                    if (interval === 1) {
                      description =
                        frequency.charAt(0).toUpperCase() + frequency.slice(1);
                    } else {
                      description = `Every ${interval} ${frequency === "daily" ? "days" : frequency === "weekly" ? "weeks" : frequency === "monthly" ? "months" : "years"}`;
                    }
                    if (
                      frequency === "weekly" &&
                      byWeekDay &&
                      byWeekDay.length > 0
                    ) {
                      const dayNames = byWeekDay
                        .map((d: number) => WEEKDAY_SHORT[d])
                        .join(", ");
                      description += ` on ${dayNames}`;
                    }
                    if (count) description += `, ${count} times`;
                    else if (until)
                      description += `, until ${format(new Date(until), "MMM d, yyyy")}`;
                    return description;
                  })()}
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* EDIT MODE */
        <div className="space-y-3">
          {/* Title Input */}
          <Input
            value={eventForm.eventTitle}
            onChange={(e) => eventForm.setEventTitle(e.target.value)}
            placeholder="Event title"
            className={`${desktop ? "h-9 text-sm" : "text-lg font-semibold h-10"}`}
            autoFocus
          />

          {/* Primary Controls */}
          <div className="space-y-4">
            {/* Calendar Select */}
            <div className="space-y-1.5">
              <Label className="text-sm">Calendar</Label>
              <Select
                value={eventForm.eventCalendarId}
                onValueChange={eventForm.setEventCalendarId}
              >
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue placeholder="Select calendar" />
                </SelectTrigger>
                <SelectContent>
                  {calendars.filter((c) => !c.isSyncOnly).map((calendar) => (
                    <SelectItem key={calendar.id} value={calendar.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: getColorSwatchValue(calendar.color) }}
                        />
                        <span>{calendar.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date & Time */}
            <div className="space-y-1.5">
              <Label className="text-sm">Date & Time</Label>
              <div className="space-y-2">
                {/* Date pickers - Start and End */}
                <div className="flex items-center gap-2">
                  {/* Start Date */}
                  {desktop ? (
                    <Popover
                      open={eventForm.startDateOpen}
                      onOpenChange={eventForm.setStartDateOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="flex-1 h-9 justify-start font-normal cursor-pointer bg-input border-0 shadow-none hover:bg-input/80 text-input-foreground"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                          {format(eventForm.eventStartDate, "EEE, MMM d")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarUI
                          mode="single"
                          selected={eventForm.eventStartDate}
                          weekStartsOn={1}
                          onSelect={(date) => {
                            if (date) {
                              eventForm.setEventStartDate(date);
                              if (date > eventForm.eventEndDate)
                                eventForm.setEventEndDate(date);
                              eventForm.setStartDateOpen(false);
                            }
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <Drawer
                      open={eventForm.startDateOpen}
                      onOpenChange={(nextOpen) => {
                        if (nextOpen) {
                          eventForm.setEndDateOpen(false);
                        }
                        eventForm.setStartDateOpen(nextOpen);
                      }}
                    >
                      <DrawerTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-9 text-sm font-medium justify-start text-foreground cursor-pointer"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                          <span className="truncate">
                            {format(eventForm.eventStartDate, "EEE, MMM d")}
                          </span>
                        </Button>
                      </DrawerTrigger>
                      <DrawerContent className="pb-safe">
                        <DrawerTitle className="sr-only">
                          Select start date
                        </DrawerTitle>
                        <div className="flex justify-center p-4 pb-8">
                          <CalendarUI
                            mode="single"
                            selected={eventForm.eventStartDate}
                            weekStartsOn={1}
                            onSelect={(date) => {
                              if (date) {
                                eventForm.setEventStartDate(date);
                                if (date > eventForm.eventEndDate)
                                  eventForm.setEventEndDate(date);
                                eventForm.setStartDateOpen(false);
                              }
                            }}
                            initialFocus
                          />
                        </div>
                      </DrawerContent>
                    </Drawer>
                  )}

                  <span className="text-muted-foreground text-sm font-medium">
                    →
                  </span>

                  {/* End Date */}
                  {desktop ? (
                    <Popover
                      open={eventForm.endDateOpen}
                      onOpenChange={eventForm.setEndDateOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="flex-1 h-9 justify-start font-normal cursor-pointer bg-input border-0 shadow-none hover:bg-input/80 text-input-foreground"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                          {format(eventForm.eventEndDate, "EEE, MMM d")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <CalendarUI
                          mode="single"
                          selected={eventForm.eventEndDate}
                          weekStartsOn={1}
                          disabled={(date) => date < eventForm.eventStartDate}
                          onSelect={(date) => {
                            if (date) {
                              eventForm.setEventEndDate(date);
                              eventForm.setEndDateOpen(false);
                            }
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <Drawer
                      open={eventForm.endDateOpen}
                      onOpenChange={(nextOpen) => {
                        if (nextOpen) {
                          eventForm.setStartDateOpen(false);
                        }
                        eventForm.setEndDateOpen(nextOpen);
                      }}
                    >
                      <DrawerTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-9 text-sm font-medium justify-start text-foreground cursor-pointer"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                          <span className="truncate">
                            {format(eventForm.eventEndDate, "EEE, MMM d")}
                          </span>
                        </Button>
                      </DrawerTrigger>
                      <DrawerContent className="pb-safe">
                        <DrawerTitle className="sr-only">
                          Select end date
                        </DrawerTitle>
                        <div className="flex justify-center p-4 pb-8">
                          <CalendarUI
                            mode="single"
                            selected={eventForm.eventEndDate}
                            weekStartsOn={1}
                            disabled={(date) => date < eventForm.eventStartDate}
                            onSelect={(date) => {
                              if (date) {
                                eventForm.setEventEndDate(date);
                                eventForm.setEndDateOpen(false);
                              }
                            }}
                            initialFocus
                          />
                        </div>
                      </DrawerContent>
                    </Drawer>
                  )}
                </div>

                {/* Time */}
                {!eventForm.eventAllDay ? (
                  <div className="flex items-center gap-2">
                    <ShadcnAutocomleteTimePicker
                      value={(() => {
                        const [hours, minutes] = eventForm.eventStartTime
                          .split(":")
                          .map(Number);
                        const date = new Date();
                        date.setHours(hours || 0, minutes || 0, 0, 0);
                        return date;
                      })()}
                      onChange={(date) => {
                        const timeString = `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
                        eventForm.handleStartTimeChange(timeString);
                      }}
                      is24Hour={localSettings?.timeFormat === "24h"}
                      className={`flex-1 h-9 cursor-pointer ${desktop ? "bg-input border-0 shadow-none hover:bg-input/80 text-input-foreground" : ""}`}
                    />
                    <span className="text-muted-foreground text-sm font-medium">
                      →
                    </span>
                    <ShadcnAutocomleteTimePicker
                      value={(() => {
                        const [hours, minutes] = eventForm.eventEndTime
                          .split(":")
                          .map(Number);
                        const date = new Date();
                        date.setHours(hours || 0, minutes || 0, 0, 0);
                        return date;
                      })()}
                      onChange={(date) => {
                        const timeString = `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
                        eventForm.handleEndTimeChange(timeString);
                      }}
                      is24Hour={localSettings?.timeFormat === "24h"}
                      className={`flex-1 h-9 cursor-pointer ${desktop ? "bg-input border-0 shadow-none hover:bg-input/80 text-input-foreground" : ""}`}
                    />
                  </div>
                ) : null}

                {/* All day toggle */}
                {desktop ? (
                  <div className="flex items-center gap-2 py-1">
                    <Checkbox
                      id="event-all-day-checkbox"
                      checked={eventForm.eventAllDay}
                      onCheckedChange={(checked) =>
                        eventForm.setEventAllDay(checked === true)
                      }
                    />
                    <Label
                      htmlFor="event-all-day-checkbox"
                      className="text-sm cursor-pointer"
                    >
                      All day
                    </Label>
                  </div>
                ) : (
                  <div className="flex items-center justify-between w-full py-3 px-1">
                    <span className="text-sm font-medium text-foreground">
                      All day
                    </span>
                    <Switch
                      checked={eventForm.eventAllDay}
                      onCheckedChange={(checked) =>
                        eventForm.setEventAllDay(checked)
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Expanded Fields - shown when options are toggled in header */}
          {(showLocation ||
            showDescription ||
            eventForm.isRecurring ||
            eventForm.showNotifications) && (
            <div className="space-y-3 pt-3 mt-3 border-t border-border/50">
              {showLocation && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <Input
                    value={eventForm.eventLocation}
                    onChange={(e) => eventForm.setEventLocation(e.target.value)}
                    placeholder="Location"
                    className={`${desktop ? "h-9 text-sm" : "h-10"}`}
                  />
                </div>
              )}

              {showDescription && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <Textarea
                    value={eventForm.eventDescription}
                    onChange={(e) =>
                      eventForm.setEventDescription(e.target.value)
                    }
                    placeholder="Description..."
                    className={`min-h-[60px] text-sm resize-none ${desktop ? "h-9" : ""}`}
                  />
                </div>
              )}

              {eventForm.isRecurring && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <RecurringEventForm
                    isRecurring={eventForm.isRecurring}
                    onIsRecurringChange={eventForm.setIsRecurring}
                    recurrenceRule={eventForm.recurrenceRule}
                    onRecurrenceRuleChange={eventForm.setRecurrenceRule}
                    eventStartDate={eventForm.eventStartDate}
                    eventEndDate={eventForm.eventEndDate}
                  />
                </div>
              )}

              {eventForm.showNotifications && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-3 rounded-lg border bg-muted/30">
                    <NotificationManager
                      eventId={eventForm.selectedEvent?.id}
                      notifications={eventForm.eventNotifications}
                      onChange={eventForm.handleNotificationChange}
                      loading={eventForm.notificationsLoading}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface FooterProps {
  isViewMode: boolean;
  eventForm: BodyProps["eventForm"];
  onBack?: () => void;
  handleEventSave: () => void;
  handleEventDelete: () => void;
  handleEventDownloadIcs: () => void;
  desktop?: boolean;
  onClose?: () => void;
}

function EventEditorFooter({
  isViewMode,
  eventForm,
  onBack,
  handleEventSave,
  handleEventDelete,
  handleEventDownloadIcs,
  desktop,
  onClose,
}: FooterProps) {
  const handleDelete = () => {
    const isRecurringEvent = !!(
      eventForm.selectedEvent?.recurrence ||
      eventForm.selectedEvent?.isRecurringInstance ||
      eventForm.selectedEvent?.parentEventId ||
      (eventForm.selectedEvent?.id &&
        eventForm.selectedEvent.id.includes("_"))
    );
    if (isRecurringEvent) {
      eventForm.setShowRecurringDeleteModal(true);
    } else {
      handleEventDelete();
    }
  };

  if (desktop) {
    return (
      <div className="px-3 py-2 border-t border-border/50 flex flex-row items-center gap-2 shrink-0">
        {isViewMode ? (
          <>
            {eventForm.selectedEvent?.id &&
              !eventForm.selectedEvent.isSynced && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              )}
            <div className="flex-1" />
            {eventForm.selectedEvent?.id && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleEventDownloadIcs}
              >
                <Download className="h-4 w-4" /> ICS
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
            {eventForm.selectedEvent?.id &&
              !eventForm.selectedEvent.isSynced && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => eventForm.setEventViewMode("edit")}
                  className="text-primary hover:bg-primary/10"
                >
                  <Edit3 className="h-4 w-4" /> Edit
                </Button>
              )}
          </>
        ) : (
          <>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleEventSave}
              disabled={
                eventForm.eventSaving ||
                !eventForm.eventCalendarId ||
                !eventForm.eventTitle.trim()
              }
            >
              {eventForm.eventSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save
                </>
              )}
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-t border-border/50 bg-muted/30 flex flex-row gap-3 shrink-0">
      {isViewMode ? (
        <>
          {eventForm.selectedEvent?.id && !eventForm.selectedEvent.isSynced && (
            <Button
              variant="outline"
              onClick={handleDelete}
              className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </Button>
          )}
          <div className="flex-1" />
          {eventForm.selectedEvent?.id && (
            <Button variant="outline" onClick={handleEventDownloadIcs}>
              <Download className="h-4 w-4 mr-2" /> ICS
            </Button>
          )}
          <Button variant="outline" onClick={onBack}>
            Close
          </Button>
          {eventForm.selectedEvent?.id && !eventForm.selectedEvent.isSynced && (
            <Button onClick={() => eventForm.setEventViewMode("edit")}>
              <Edit3 className="h-4 w-4 mr-2" /> Edit
            </Button>
          )}
        </>
      ) : (
        <>
          <Button
            variant="outline"
            onClick={
              eventForm.selectedEvent?.id
                ? () => eventForm.setEventViewMode("view")
                : onBack
            }
          >
            Cancel
          </Button>
          <div className="flex-1" />
          <Button
            onClick={handleEventSave}
            disabled={
              eventForm.eventSaving ||
              !eventForm.eventCalendarId ||
              !eventForm.eventTitle.trim()
            }
          >
            {eventForm.eventSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save
              </>
            )}
          </Button>
        </>
      )}
    </div>
  );
}
