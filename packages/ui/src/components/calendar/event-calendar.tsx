"use client";

import { useEffect, useMemo, useState } from "react";
import { useCalendarContext } from "./calendar-context";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfWeek,
  format,
  isSameMonth,
  startOfWeek,
  subMonths,
  subWeeks,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import {
  AgendaDaysToShow,
  EventGap,
  EventHeight,
  WeekCellsHeight,
} from "./constants";
import { addHoursToDate, addMinutesToDate } from "./utils";
import { CalendarEvent, CalendarView } from "./types";
import { AgendaView } from "./agenda-view";
import { DayView } from "./day-view";
import { MonthView } from "./month-view";
import { WeekView } from "./week-view";
import { EventDialog } from "./event-dialog";
import { EventNotification } from "./notification-manager";
import { CalendarDndProvider } from "./calendar-dnd-context";
import { CalendarSkeleton } from "./calendar-skeleton";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { ErrorBoundary } from "../ui/error-boundary";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { SidebarTrigger, useSidebar } from "../ui/sidebar";
import { ThemeToggle } from "../layout/theme-toggle";

export interface EventCalendarProps {
  className?: string;
  initialView?: CalendarView;
  // Data props
  events?: CalendarEvent[];
  categories?: any[];
  loading?: boolean;
  eventsLoading?: boolean;
  error?: any;
  // Event handlers
  onCreateEvent?: (event: any) => Promise<any>;
  onUpdateEvent?: (id: string, event: any) => Promise<any>;
  onDeleteEvent?: (id: string) => Promise<void>;
  onCreateCategory?: (category: any) => Promise<any>;
  // Settings
  showWeekNumbers?: boolean;
  compactView?: boolean;
  timeFormat?: "12h" | "24h";
  defaultReminder?: number | null;
  defaultEventDuration?: number;
  defaultCalendarId?: string | null;
  weekStartDay?: number;
  workingDays?: number[];
  timezone?: string;
  // Theme settings
  themeSettings?: {
    currentTheme: "light" | "dark" | "system";
    updateTheme: (theme: "light" | "dark" | "system") => Promise<void>;
  };
  // Notification handlers
  onLoadNotifications?: (eventId: string) => Promise<EventNotification[]>;
  onUpdateNotifications?: (
    eventId: string,
    notifications: EventNotification[]
  ) => Promise<void>;
}

export function EventCalendar({
  className,
  initialView = "month",
  events = [],
  categories = [],
  loading = false,
  eventsLoading = false,
  error = null,
  onCreateEvent,
  onUpdateEvent,
  onDeleteEvent,
  onCreateCategory,
  showWeekNumbers = false,
  compactView = false,
  timeFormat = "12h",
  defaultReminder = null,
  defaultEventDuration = 60,
  defaultCalendarId = null,
  weekStartDay = 0,
  workingDays = [1, 2, 3, 4, 5],
  timezone,
  themeSettings,
  onLoadNotifications,
  onUpdateNotifications,
}: EventCalendarProps) {
  // Use the shared calendar context instead of local state
  const { currentDate, setCurrentDate } = useCalendarContext();
  const [view, setView] = useState<CalendarView>(initialView);

  // Update view when initialView changes (from settings)
  useEffect(() => {
    setView(initialView);
  }, [initialView]);
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null
  );
  const { open } = useSidebar();

  // Calculate date range based on current view and date
  const dateRange = useMemo(() => {
    let start: Date;
    let end: Date;

    if (view === "month") {
      start = startOfMonth(currentDate);
      end = endOfMonth(currentDate);
    } else if (view === "week") {
      start = startOfWeek(currentDate, {
        weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      });
      end = endOfWeek(currentDate, {
        weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      });
    } else if (view === "day") {
      start = new Date(currentDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(currentDate);
      end.setHours(23, 59, 59, 999);
    } else if (view === "agenda") {
      start = new Date(currentDate);
      end = addDays(currentDate, AgendaDaysToShow - 1);
    } else {
      start = startOfMonth(currentDate);
      end = endOfMonth(currentDate);
    }

    return { start, end };
  }, [currentDate, view]);

  // Use the provided event handlers with fallbacks
  const createEvent = onCreateEvent || (async () => {});
  const updateEvent = onUpdateEvent || (async () => {});
  const deleteEvent = onDeleteEvent || (async () => {});
  const createCategory = onCreateCategory || (async () => {});

  // Add keyboard shortcuts for view switching
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input, textarea or contentEditable element
      // or if the event dialog is open
      if (
        isEventDialogOpen ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case "m":
          setView("month");
          break;
        case "w":
          setView("week");
          break;
        case "d":
          setView("day");
          break;
        case "a":
          setView("agenda");
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEventDialogOpen]);

  const handlePrevious = () => {
    if (view === "month") {
      setCurrentDate(subMonths(currentDate, 1));
    } else if (view === "week") {
      setCurrentDate(subWeeks(currentDate, 1));
    } else if (view === "day") {
      setCurrentDate(addDays(currentDate, -1));
    } else if (view === "agenda") {
      // For agenda view, go back 30 days (a full month)
      setCurrentDate(addDays(currentDate, -AgendaDaysToShow));
    }
  };

  const handleNext = () => {
    if (view === "month") {
      setCurrentDate(addMonths(currentDate, 1));
    } else if (view === "week") {
      setCurrentDate(addWeeks(currentDate, 1));
    } else if (view === "day") {
      setCurrentDate(addDays(currentDate, 1));
    } else if (view === "agenda") {
      // For agenda view, go forward 30 days (a full month)
      setCurrentDate(addDays(currentDate, AgendaDaysToShow));
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleEventSelect = (event: CalendarEvent) => {
    console.log("Event selected:", event); // Debug log
    setSelectedEvent(event);
    setIsEventDialogOpen(true);
  };

  const handleEventCreate = (startTime: Date) => {
    console.log("Creating new event at:", startTime); // Debug log

    // Snap to 15-minute intervals
    const minutes = startTime.getMinutes();
    const remainder = minutes % 15;
    if (remainder !== 0) {
      if (remainder < 7.5) {
        // Round down to nearest 15 min
        startTime.setMinutes(minutes - remainder);
      } else {
        // Round up to nearest 15 min
        startTime.setMinutes(minutes + (15 - remainder));
      }
      startTime.setSeconds(0);
      startTime.setMilliseconds(0);
    }

    const newEvent: CalendarEvent = {
      id: "",
      title: "",
      start: startTime,
      end: addMinutesToDate(startTime, defaultEventDuration), // Use default duration from settings
      allDay: false,
      calendarId: "",
      userId: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setSelectedEvent(newEvent);
    setIsEventDialogOpen(true);
  };

  const handleEventSave = async (
    event: CalendarEvent
  ): Promise<CalendarEvent> => {
    try {
      const eventData = {
        title: event.title,
        description: event.description,
        start: event.start.toISOString(),
        end: event.end.toISOString(),
        allDay: event.allDay || false,
        location: event.location,
        color: event.color, // This now comes from the calendar color
        calendarId: event.calendarId,
        categoryId: (event as any).categoryId || undefined,
        reminder: event.reminder,
      };

      let savedEvent: any;
      if (event.id) {
        // Update existing event
        savedEvent = await updateEvent(event.id, eventData);

        // Show success toast notification when an event is updated
        toast.success(`Event "${event.title}" updated`, {
          description: format(new Date(event.start), "MMM d, yyyy 'at' h:mm a"),
          position: "bottom-left",
        });
      } else {
        // Create new event
        savedEvent = await createEvent(eventData);

        // Show success toast notification when an event is created
        toast.success(`Event "${event.title}" created`, {
          description: format(new Date(event.start), "MMM d, yyyy 'at' h:mm a"),
          position: "bottom-left",
        });
      }

      setIsEventDialogOpen(false);
      setSelectedEvent(null);

      // Return the saved event, or the original event if savedEvent is undefined
      return savedEvent || event;
    } catch (error: any) {
      console.error("Failed to save event:", error);

      // Show detailed error message based on error type
      const errorMessage = error?.message || "Failed to save event";
      const isNetworkError =
        error?.error === "Network Error" ||
        error?.statusCode === 0 ||
        !navigator.onLine;

      if (isNetworkError) {
        toast.error("Network error", {
          description: "Please check your connection and try again",
          position: "bottom-left",
        });
      } else if (error?.statusCode === 401) {
        toast.error("Authentication required", {
          description: "Please log in again to continue",
          position: "bottom-left",
        });
      } else if (error?.statusCode === 403) {
        toast.error("Permission denied", {
          description: "You don't have permission to perform this action",
          position: "bottom-left",
        });
      } else if (error?.details && error.details.length > 0) {
        toast.error("Validation error", {
          description: error.details.map((d: any) => d.message).join(", "),
          position: "bottom-left",
        });
      } else if (error?.statusCode === 400) {
        toast.error("Invalid data", {
          description: errorMessage,
          position: "bottom-left",
        });
      } else {
        toast.error("Failed to save event", {
          description: errorMessage,
          position: "bottom-left",
        });
      }

      throw error;
    }
  };

  const handleEventDelete = async (eventId: string) => {
    try {
      const deletedEvent = events.find((e: CalendarEvent) => e.id === eventId);

      await deleteEvent(eventId);

      setIsEventDialogOpen(false);
      setSelectedEvent(null);

      // Show success toast notification when an event is deleted
      if (deletedEvent) {
        toast.success(`Event "${deletedEvent.title}" deleted`, {
          description: format(new Date(deletedEvent.start), "MMM d, yyyy"),
          position: "bottom-left",
        });
      }
    } catch (error: any) {
      console.error("Failed to delete event:", error);

      // Show detailed error message based on error type
      const errorMessage = error?.message || "Failed to delete event";
      const isNetworkError =
        error?.error === "Network Error" ||
        error?.statusCode === 0 ||
        !navigator.onLine;

      if (isNetworkError) {
        toast.error("Network error", {
          description: "Please check your connection and try again",
          position: "bottom-left",
        });
      } else if (error?.statusCode === 401) {
        toast.error("Authentication required", {
          description: "Please log in again to continue",
          position: "bottom-left",
        });
      } else if (error?.statusCode === 403) {
        toast.error("Permission denied", {
          description: "You don't have permission to delete this event",
          position: "bottom-left",
        });
      } else if (error?.statusCode === 404) {
        toast.error("Event not found", {
          description: "This event may have already been deleted",
          position: "bottom-left",
        });
      } else if (error?.statusCode === 400) {
        toast.error("Invalid request", {
          description: errorMessage,
          position: "bottom-left",
        });
      } else {
        toast.error("Failed to delete event", {
          description: errorMessage,
          position: "bottom-left",
        });
      }
    }
  };

  const handleEventUpdate = async (updatedEvent: CalendarEvent) => {
    try {
      const eventData = {
        title: updatedEvent.title,
        description: updatedEvent.description,
        start: updatedEvent.start.toISOString(),
        end: updatedEvent.end.toISOString(),
        allDay: updatedEvent.allDay,
        location: updatedEvent.location,
        color: updatedEvent.color,
      };

      await updateEvent(updatedEvent.id, eventData);

      // Show success toast notification when an event is updated via drag and drop
      toast.success(`Event "${updatedEvent.title}" moved`, {
        description: format(
          new Date(updatedEvent.start),
          "MMM d, yyyy 'at' h:mm a"
        ),
        position: "bottom-left",
      });
    } catch (error: any) {
      console.error("Failed to update event:", error);

      // Show detailed error message based on error type
      const errorMessage = error?.message || "Failed to move event";
      const isNetworkError =
        error?.error === "Network Error" ||
        error?.statusCode === 0 ||
        !navigator.onLine;

      if (isNetworkError) {
        toast.error("Network error", {
          description: "Please check your connection and try again",
          position: "bottom-left",
        });
      } else if (error?.statusCode === 401) {
        toast.error("Authentication required", {
          description: "Please log in again to continue",
          position: "bottom-left",
        });
      } else if (error?.statusCode === 403) {
        toast.error("Permission denied", {
          description: "You don't have permission to move this event",
          position: "bottom-left",
        });
      } else if (error?.statusCode === 400) {
        toast.error("Invalid request", {
          description: errorMessage,
          position: "bottom-left",
        });
      } else {
        toast.error("Failed to move event", {
          description: errorMessage,
          position: "bottom-left",
        });
      }
    }
  };

  const viewTitle = useMemo(() => {
    if (view === "month") {
      return format(currentDate, "MMMM yyyy");
    } else if (view === "week") {
      const start = startOfWeek(currentDate, {
        weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      });
      const end = endOfWeek(currentDate, {
        weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      });
      if (isSameMonth(start, end)) {
        return format(start, "MMMM yyyy");
      } else {
        return `${format(start, "MMM")} - ${format(end, "MMM yyyy")}`;
      }
    } else if (view === "day") {
      return (
        <>
          <span className="min-sm:hidden" aria-hidden="true">
            {format(currentDate, "MMM d, yyyy")}
          </span>
          <span className="max-sm:hidden min-md:hidden" aria-hidden="true">
            {format(currentDate, "MMMM d, yyyy")}
          </span>
          <span className="max-md:hidden">
            {format(currentDate, "EEE MMMM d, yyyy")}
          </span>
        </>
      );
    } else if (view === "agenda") {
      // Show the month range for agenda view
      const start = currentDate;
      const end = addDays(currentDate, AgendaDaysToShow - 1);

      if (isSameMonth(start, end)) {
        return format(start, "MMMM yyyy");
      } else {
        return `${format(start, "MMM")} - ${format(end, "MMM yyyy")}`;
      }
    } else {
      return format(currentDate, "MMMM yyyy");
    }
  }, [currentDate, view]);

  // Show loading state with skeleton
  if (eventsLoading) {
    return (
      <div className={cn("rounded-lg", className)}>
        <CalendarSkeleton view={view} />
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-600 mb-2">Failed to load calendar</p>
          <p className="text-sm text-gray-500">{error.message}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => window.location.reload()}
          >
            <Loader2 className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        console.error("Calendar error:", error, errorInfo);
        toast.error("Calendar encountered an error. Please refresh the page.");
      }}
    >
      <div
        className="flex has-data-[slot=month-view]:flex-1 flex-col rounded-lg"
        style={
          {
            "--event-height": `${compactView ? Math.round(EventHeight * 0.75) : EventHeight}px`,
            "--event-gap": `${compactView ? Math.round(EventGap * 0.5) : EventGap}px`,
            "--week-cells-height": `${compactView ? Math.round(WeekCellsHeight * 0.85) : WeekCellsHeight}px`,
          } as React.CSSProperties
        }
      >
        <CalendarDndProvider onEventUpdate={handleEventUpdate}>
          <div
            className={cn(
              "flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-5 sm:px-4",
              className
            )}
          >
            <div className="flex sm:flex-col max-sm:items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5">
                <SidebarTrigger
                  data-state={open ? "invisible" : "visible"}
                  className="peer size-7 text-muted-foreground/80 hover:text-foreground/80 hover:bg-transparent! sm:-ms-1.5 lg:data-[state=invisible]:opacity-0 lg:data-[state=invisible]:pointer-events-none transition-opacity ease-in-out duration-200"
                  isOutsideSidebar
                />
                <h2 className="font-semibold text-xl lg:peer-data-[state=invisible]:-translate-x-7.5 transition-transform ease-in-out duration-300">
                  {viewTitle}
                </h2>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center sm:gap-2 max-sm:order-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="max-sm:size-8"
                    onClick={handlePrevious}
                    aria-label="Previous"
                    disabled={loading}
                  >
                    <ChevronLeftIcon size={16} aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="max-sm:size-8"
                    onClick={handleNext}
                    aria-label="Next"
                    disabled={loading}
                  >
                    <ChevronRightIcon size={16} aria-hidden="true" />
                  </Button>
                </div>
                <Button
                  className="max-sm:h-8 max-sm:px-2.5! bg-accent hover:bg-accent/80 text-accent-foreground"
                  onClick={handleToday}
                  disabled={loading}
                >
                  Today
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  className="max-sm:h-8 max-sm:px-2.5!"
                  onClick={() => {
                    // Create a new event starting at current time or selected date
                    const startTime = new Date(currentDate);
                    const now = new Date();

                    // If the current date is today, start at the current time (rounded to next 15-min interval)
                    if (startTime.toDateString() === now.toDateString()) {
                      // Use current time and round to next 15-minute interval
                      startTime.setHours(
                        now.getHours(),
                        now.getMinutes(),
                        0,
                        0
                      );
                      const minutes = startTime.getMinutes();
                      const remainder = minutes % 15;
                      if (remainder !== 0) {
                        // Round up to next 15-minute interval
                        startTime.setMinutes(minutes + (15 - remainder));
                      }
                    } else {
                      // Otherwise start at 9 AM
                      startTime.setHours(9, 0, 0, 0);
                    }

                    handleEventCreate(startTime);
                  }}
                  disabled={loading}
                >
                  New Event
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="gap-1.5 max-sm:h-8 max-sm:px-2! max-sm:gap-1"
                      disabled={loading}
                    >
                      <span className="capitalize">{view}</span>
                      <ChevronDownIcon
                        className="-me-1 opacity-60"
                        size={16}
                        aria-hidden="true"
                      />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-32">
                    <DropdownMenuItem onClick={() => setView("month")}>
                      Month <DropdownMenuShortcut>M</DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setView("week")}>
                      Week <DropdownMenuShortcut>W</DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setView("day")}>
                      Day <DropdownMenuShortcut>D</DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setView("agenda")}>
                      Agenda <DropdownMenuShortcut>A</DropdownMenuShortcut>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <ThemeToggle useSettingsTheme={themeSettings} />
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col">
            {view === "month" && (
              <MonthView
                currentDate={currentDate}
                events={events}
                onEventSelect={handleEventSelect}
                onEventCreate={handleEventCreate}
                showWeekNumbers={showWeekNumbers}
                compactView={compactView}
                timeFormat={timeFormat}
                weekStartDay={weekStartDay}
                workingDays={workingDays}
              />
            )}
            {view === "week" && (
              <WeekView
                currentDate={currentDate}
                events={events}
                onEventSelect={handleEventSelect}
                onEventCreate={handleEventCreate}
                compactView={compactView}
                timeFormat={timeFormat}
                weekStartDay={weekStartDay}
                workingDays={workingDays}
                timezone={timezone}
              />
            )}
            {view === "day" && (
              <DayView
                currentDate={currentDate}
                events={events}
                onEventSelect={handleEventSelect}
                onEventCreate={handleEventCreate}
                compactView={compactView}
                timeFormat={timeFormat}
                timezone={timezone}
              />
            )}
            {view === "agenda" && (
              <AgendaView
                currentDate={currentDate}
                events={events}
                onEventSelect={handleEventSelect}
                timeFormat={timeFormat}
              />
            )}
          </div>

          <EventDialog
            event={selectedEvent}
            isOpen={isEventDialogOpen}
            onClose={() => {
              setIsEventDialogOpen(false);
              setSelectedEvent(null);
            }}
            onSave={handleEventSave}
            onDelete={handleEventDelete}
            loading={loading}
            error={error}
            timeFormat={timeFormat}
            defaultReminder={defaultReminder}
            defaultEventDuration={defaultEventDuration}
            defaultCalendarId={defaultCalendarId}
            onLoadNotifications={onLoadNotifications}
            onUpdateNotifications={onUpdateNotifications}
          />
        </CalendarDndProvider>
      </div>
    </ErrorBoundary>
  );
}
