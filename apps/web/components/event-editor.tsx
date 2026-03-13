"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import type { CalendarEvent, Calendar } from "@workspace/ui/components/calendar/types";
import { format } from "date-fns";
import type { UserSettings } from "@/lib/types/calendar";
import { NotificationManager } from "@workspace/ui/components/calendar/notification-manager";
import { formatEventDescription } from "@workspace/ui/components/calendar";
import { RecurringEventForm } from "./command-palette/recurring-event-form";
import { RecurringDeleteModal } from "./command-palette/recurring-delete-modal";
import { useEventForm } from "@/hooks/use-event-form";
import { ShadcnAutocomleteTimePicker } from "@workspace/ui/components/ui/autocompletetimepicker";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@workspace/ui/components/ui/drawer";
import { useIsMobile } from "@workspace/ui/hooks/use-mobile";
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
  updatePreviewEvent?: (updates: Partial<CalendarEvent>) => void;
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
  updatePreviewEvent,
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
      // Auto-expand fields if they have data
      if (eventToEdit.description) setShowDescription(true);
      if (eventToEdit.location) setShowLocation(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventToEdit, open]);

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

  const isViewMode = eventForm.eventViewMode === "view";
  const isMobile = useIsMobile();
  const keyboardHeight = useKeyboardHeight();
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
        <Drawer open={open} onOpenChange={onOpenChange} direction="bottom" modal={true}>
          <DrawerContent
            className="rounded-t-2xl bg-card/95 backdrop-blur-xl border-none flex flex-col gap-0 overflow-hidden pb-0 transition-[max-height,bottom] duration-200 ease-out"
            style={{
              maxHeight: keyboardHeight > 0 ? `calc(100dvh - ${keyboardHeight}px)` : "92dvh",
              bottom: keyboardHeight,
            }}
          >
            <DrawerTitle className="sr-only">{dialogTitle}</DrawerTitle>
            <div className="px-5 py-3 border-b border-border/40 flex flex-row items-center shrink-0">
              <h2 className="text-base font-semibold">{dialogTitle}</h2>
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
        recurringModal={recurringModal}
      />
    );
  }

  // Desktop modal mode (default)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose={false} className="sm:max-w-[520px] p-0 gap-0 overflow-hidden flex flex-col">
        <div className="px-6 pt-6 pb-4">
          <DialogTitle className="text-lg font-semibold">{dialogTitle}</DialogTitle>
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
  recurringModal,
}: EventEditorPopoverProps) {
  const popoverRef = React.useRef<HTMLDivElement>(null);

  // Calculate position synchronously before paint to avoid flash
  // useLayoutEffect runs before browser paint, so position is set before first render
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null);
  const positionRef = React.useRef<{ top: number; left: number } | null>(null);

  // Calculate position synchronously - runs before paint
  React.useLayoutEffect(() => {
    if (!open || !anchorPosition) {
      if (!open) setPosition(null);
      return;
    }

    const POPOVER_WIDTH = 380;
    const POPOVER_MAX_HEIGHT = 520;
    const VIEWPORT_PADDING = 16;
    const GAP = 12;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // If we have a preview event rendered in timeline, anchor beside it
    const previewEl = document.querySelector("[data-preview-event='true']") as HTMLElement | null;
    let anchorX = anchorPosition.x;
    let anchorY = anchorPosition.y;

    if (previewEl) {
      const rect = previewEl.getBoundingClientRect();
      anchorX = rect.right + GAP;
      anchorY = rect.top;
    }

    let left = anchorX;
    let top = anchorY;

    // Horizontal: prefer right side of anchor, flip to left if overflow
    if (left + POPOVER_WIDTH + VIEWPORT_PADDING > viewportWidth) {
      left = Math.max(
        VIEWPORT_PADDING,
        (previewEl ? previewEl.getBoundingClientRect().left - POPOVER_WIDTH - GAP : anchorX - POPOVER_WIDTH - GAP),
      );
    }

    // Vertical: clamp to viewport
    if (top + POPOVER_MAX_HEIGHT + VIEWPORT_PADDING > viewportHeight) {
      top = Math.max(VIEWPORT_PADDING, viewportHeight - POPOVER_MAX_HEIGHT - VIEWPORT_PADDING);
    }
    if (top < VIEWPORT_PADDING) top = VIEWPORT_PADDING;

    const newPos = { top, left };
    positionRef.current = newPos;
    setPosition(newPos);
  }, [open, anchorPosition]);

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
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
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
      <div
        className="fixed inset-0 z-50"
        onClick={() => onOpenChange(false)}
      />
      {/* Popover panel */}
      <div
        ref={popoverRef}
        className="fixed z-50 w-[380px] max-h-[520px] bg-card border border-border rounded-xl shadow-xl flex flex-col overflow-hidden"
        style={{
          top: position?.top ?? 0,
          left: position?.left ?? 0,
        }}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-semibold">{dialogTitle}</h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-1 rounded-md hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
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
  const bodyClass = desktop
    ? "px-6 pb-4 space-y-5 flex-1 overflow-y-auto"
    : "p-4 space-y-4 flex-1 overflow-y-auto custom-scrollbar";

  return (
    <div className={bodyClass}>
          {isViewMode ? (
            /* VIEW MODE */
            <div className="space-y-5">
              <div>
                <h2 className={`font-semibold ${desktop ? "text-xl" : "text-xl"}`}>
                  {eventForm.eventTitle || "Untitled Event"}
                </h2>
                {eventForm.selectedEvent?.isSynced && (
                  <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-500 ring-1 ring-inset ring-blue-500/20 mt-1">
                    Synced
                  </span>
                )}
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">
                      {(() => {
                        const startStr = format(
                          eventForm.eventStartDate,
                          "EEEE, MMMM d, yyyy"
                        );
                        const endStr = format(
                          eventForm.eventEndDate,
                          "EEEE, MMMM d, yyyy"
                        );
                        const isSameDay = startStr === endStr;

                        if (isSameDay) {
                          return startStr;
                        }
                        return (
                          <>
                            {format(eventForm.eventStartDate, "EEE, MMM d")}
                            <span className="text-muted-foreground mx-1.5">
                              →
                            </span>
                            {format(eventForm.eventEndDate, "EEE, MMM d, yyyy")}
                          </>
                        );
                      })()}
                    </div>
                    <div className="text-muted-foreground">
                      {!eventForm.eventAllDay
                        ? `${eventForm.eventStartTime} - ${eventForm.eventEndTime}`
                        : "All day"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor:
                        calendars.find(
                          (c) => c.id === eventForm.eventCalendarId
                        )?.color || "#3b82f6",
                    }}
                  />
                  <span>
                    {calendars.find((c) => c.id === eventForm.eventCalendarId)
                      ?.name || "Unknown Calendar"}
                  </span>
                </div>

                {eventForm.eventLocation && (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <span className="flex-1 min-w-0">
                      {eventForm.eventLocation}
                    </span>
                  </div>
                )}

                {eventForm.eventDescription && (
                  <div className="flex items-start gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div className="whitespace-pre-wrap flex-1 min-w-0">
                      {formatEventDescription(eventForm.eventDescription)}
                    </div>
                  </div>
                )}

                {eventForm.isRecurring && eventForm.recurrenceRule && (
                  <div className="flex items-start gap-3">
                    <RotateCcw className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <span className="flex-1 min-w-0">
                      {(() => {
                        const { frequency, interval, count, until, byWeekDay } =
                          eventForm.recurrenceRule!;
                        let description = "";
                        if (interval === 1) {
                          description =
                            frequency.charAt(0).toUpperCase() +
                            frequency.slice(1);
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
            <div className="space-y-4">
              {/* Title Input */}
              <Input
                value={eventForm.eventTitle}
                onChange={(e) => eventForm.setEventTitle(e.target.value)}
                placeholder="Event title"
                className={`${desktop ? "text-base h-10" : "text-lg font-semibold h-10"}`}
                autoFocus
              />

              {/* Primary Controls */}
              <div className="space-y-4">
                {/* Calendar Select */}
                <div>
                  <Label className="text-sm font-medium mb-2 block">
                    Calendar
                  </Label>
                  <Select
                    value={eventForm.eventCalendarId}
                    onValueChange={eventForm.setEventCalendarId}
                  >
                    <SelectTrigger className={`${desktop ? "h-10" : "h-9"} text-sm`}>
                      <div className="flex items-center gap-2 truncate">
                        <div
                          className="size-2.5 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor:
                              calendars.find(
                                (c) => c.id === eventForm.eventCalendarId
                              )?.color || "#3b82f6",
                          }}
                        />
                        <SelectValue />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {calendars.map((calendar) => (
                        <SelectItem key={calendar.id} value={calendar.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className="size-2.5 rounded-full"
                              style={{ backgroundColor: calendar.color }}
                            />
                            <span>{calendar.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Date & Time */}
                <div>
                  <Label className="text-sm font-medium mb-2 block">
                    Date & Time
                  </Label>
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
                              className="flex-1 h-10 justify-start font-normal cursor-pointer"
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
                            <DrawerTitle className="sr-only">Select start date</DrawerTitle>
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
                              className="flex-1 h-10 justify-start font-normal cursor-pointer"
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
                            <DrawerTitle className="sr-only">Select end date</DrawerTitle>
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
                          className={`flex-1 ${desktop ? "h-10" : "h-9"} cursor-pointer`}
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
                          className={`flex-1 ${desktop ? "h-10" : "h-9"} cursor-pointer`}
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
                        <button
                          type="button"
                          role="switch"
                          aria-checked={eventForm.eventAllDay}
                          onClick={() => eventForm.setEventAllDay(!eventForm.eventAllDay)}
                          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 ${
                            eventForm.eventAllDay
                              ? "bg-primary"
                              : "bg-input dark:bg-input/80"
                          }`}
                        >
                          <span
                            className={`inline-block h-6 w-6 transform rounded-full bg-background shadow-sm ring-1 ring-black/5 dark:ring-white/10 transition-transform duration-200 ${
                              eventForm.eventAllDay ? "translate-x-5.5" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Add More Options */}
              <div className="flex flex-wrap gap-2">
                {showLocation ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowLocation(false);
                      eventForm.setEventLocation("");
                    }}
                    className="inline-flex items-center gap-1.5 h-8 px-3 text-sm rounded-md border border-primary/50 bg-primary/10 text-primary cursor-pointer hover:bg-destructive/20 hover:border-destructive/30 hover:text-destructive/70 transition-colors"
                  >
                    <MapPin className="h-4 w-4" />
                    <span>Location</span>
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowLocation(true)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 text-sm rounded-md border border-dashed border-border hover:border-solid hover:bg-muted/50 transition-colors"
                  >
                    <MapPin className="h-4 w-4" /> Location
                  </button>
                )}

                {showDescription ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowDescription(false);
                      eventForm.setEventDescription("");
                    }}
                    className="inline-flex items-center gap-1.5 h-8 px-3 text-sm rounded-md border border-primary/50 bg-primary/10 text-primary cursor-pointer hover:bg-destructive/20 hover:border-destructive/30 hover:text-destructive/70 transition-colors"
                  >
                    <FileText className="h-4 w-4" />
                    <span>Description</span>
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowDescription(true)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 text-sm rounded-md border border-dashed border-border hover:border-solid hover:bg-muted/50 transition-colors"
                  >
                    <FileText className="h-4 w-4" /> Description
                  </button>
                )}

                {eventForm.isRecurring ? (
                  <button
                    type="button"
                    onClick={() => {
                      eventForm.setIsRecurring(false);
                      eventForm.setRecurrenceRule(null);
                    }}
                    className="inline-flex items-center gap-1.5 h-8 px-3 text-sm rounded-md border border-primary/50 bg-primary/10 text-primary cursor-pointer hover:bg-destructive/20 hover:border-destructive/30 hover:text-destructive/70 transition-colors"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Repeat</span>
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => eventForm.setIsRecurring(true)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 text-sm rounded-md border border-dashed border-border hover:border-solid hover:bg-muted/50 transition-colors"
                  >
                    <RotateCcw className="h-4 w-4" /> Repeat
                  </button>
                )}

                {eventForm.showNotifications ? (
                  <button
                    type="button"
                    onClick={() => eventForm.setShowNotifications(false)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 text-sm rounded-md border border-primary/50 bg-primary/10 text-primary cursor-pointer hover:bg-destructive/20 hover:border-destructive/30 hover:text-destructive/70 transition-colors"
                  >
                    <Bell className="h-4 w-4" />
                    <span>Reminder</span>
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => eventForm.setShowNotifications(true)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 text-sm rounded-md border border-dashed border-border hover:border-solid hover:bg-muted/50 transition-colors"
                  >
                    <Bell className="h-4 w-4" /> Reminder
                  </button>
                )}
              </div>

              {/* Expanded Fields */}
              <div className="space-y-4 pt-5 mt-5 border-t">
                {showLocation && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                    <Input
                      value={eventForm.eventLocation}
                      onChange={(e) =>
                        eventForm.setEventLocation(e.target.value)
                      }
                      placeholder="Location"
                      className="h-10"
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
                      className="min-h-[80px] text-sm resize-none"
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
                        defaultReminder={localSettings?.defaultReminder}
                      />
                    </div>
                  </div>
                )}
              </div>
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
  desktop?: boolean;
  onClose?: () => void;
}

function EventEditorFooter({
  isViewMode,
  eventForm,
  onBack,
  handleEventSave,
  handleEventDelete,
  desktop,
  onClose,
}: FooterProps) {
  if (desktop) {
    return (
      <div className="px-6 py-4 flex flex-row items-center gap-2 shrink-0">
        {isViewMode ? (
          <>
            {eventForm.selectedEvent?.id &&
              !eventForm.selectedEvent.isSynced && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
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
                  }}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4 mr-1.5" /> Delete
                </Button>
              )}
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
            {eventForm.selectedEvent?.id &&
              !eventForm.selectedEvent.isSynced && (
                <Button size="sm" onClick={() => eventForm.setEventViewMode("edit")}>
                  <Edit3 className="h-4 w-4 mr-1.5" /> Edit
                </Button>
              )}
          </>
        ) : (
          <>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
            >
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
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1.5" />
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
    <div className="px-4 py-3 border-t border-border/40 bg-muted/30 flex flex-row gap-3 shrink-0">
      {isViewMode ? (
        <>
          {eventForm.selectedEvent?.id &&
            !eventForm.selectedEvent.isSynced && (
              <button
                type="button"
                onClick={() => {
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
                }}
                className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium text-destructive border border-destructive/30 bg-transparent hover:bg-destructive/10 rounded-lg transition-colors"
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </button>
            )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium text-foreground border border-border bg-background hover:bg-muted rounded-lg transition-colors"
          >
            Close
          </button>
          {eventForm.selectedEvent?.id &&
            !eventForm.selectedEvent.isSynced && (
              <button
                type="button"
                onClick={() => eventForm.setEventViewMode("edit")}
                className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-colors"
              >
                <Edit3 className="h-4 w-4 mr-2" /> Edit
              </button>
            )}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={
              eventForm.selectedEvent?.id
                ? () => eventForm.setEventViewMode("view")
                : onBack
            }
            className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium text-foreground border border-border bg-background hover:bg-muted rounded-lg transition-colors"
          >
            Cancel
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleEventSave}
            disabled={
              eventForm.eventSaving ||
              !eventForm.eventCalendarId ||
              !eventForm.eventTitle.trim()
            }
            className="inline-flex items-center justify-center h-10 px-6 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none rounded-lg transition-colors"
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
          </button>
        </>
      )}
    </div>
  );
}
