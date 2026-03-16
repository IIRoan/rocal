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
  Menu,
} from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "../../hooks/use-mobile";

import {
  AgendaDaysToShow,
  EventGap,
  EventHeight,
  WeekCellsHeight,
} from "./constants";
import { addHoursToDate, addMinutesToDate } from "./utils";
import { CalendarEvent, CalendarView, User } from "./types";
import { AgendaView } from "./agenda-view";
import { DayView } from "./day-view";
import { MonthView } from "./month-view";
import { WeekView } from "./week-view";
import { MobileDayView } from "./mobile-day-view";
import { MobileWeekView } from "./mobile-week-view";
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
import { ThemeToggle } from "../layout/theme-toggle";
import { useDropdownShortcuts } from "../../hooks";

export interface MobileEventCalendarProps {
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
  // Date range change handler
  onDateRangeChange?: (dateRange: { start: Date; end: Date }) => void;
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
    notifications: EventNotification[],
  ) => Promise<void>;
  // Command palette integration
  onEventEdit?: (
    event: CalendarEvent,
    options?: {
      mode?: "modal" | "popover";
      anchorPosition?: { x: number; y: number };
    },
  ) => void;
  // Mobile specific
  onSidebarToggle?: () => void;
  // View change handler
  onViewChange?: (view: CalendarView) => void;
  user?: User;
}

export function MobileEventCalendar({
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
  onDateRangeChange,
  showWeekNumbers = false,
  compactView = false,
  timeFormat = "24h",
  defaultReminder = null,
  defaultEventDuration = 60,
  defaultCalendarId = null,
  weekStartDay = 1,
  workingDays = [1, 2, 3, 4, 5],
  timezone,
  themeSettings,
  onLoadNotifications,
  onUpdateNotifications,
  onEventEdit,
  onSidebarToggle,
  onViewChange,
  user,
}: MobileEventCalendarProps) {
  // Use the shared calendar context instead of local state
  const { currentDate, setCurrentDate } = useCalendarContext();
  const isMobile = useIsMobile();

  // Initialize view from sessionStorage or fallback to smart default
  const [view, setViewState] = useState<CalendarView>(() => {
    if (typeof window !== "undefined") {
      const savedView = sessionStorage.getItem("calendar-view-selection");
      if (savedView && ["month", "week", "day", "agenda"].includes(savedView)) {
        return savedView as CalendarView;
      }
    }
    // Default based on screen size - will be updated by useEffect when isMobile is determined
    return initialView;
  });

  // Update view when isMobile status changes and no saved preference exists
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedViewData = sessionStorage.getItem("calendar-view-selection");
      let validSavedView = null;

      // Check if we have saved data and it's not expired
      if (savedViewData) {
        try {
          const parsedData = JSON.parse(savedViewData);
          const now = new Date().getTime();

          // Only use the saved view if it hasn't expired
          if (parsedData.expires && parsedData.expires > now) {
            validSavedView = parsedData.view;
            // Set the view state to the valid saved view
            setViewState(parsedData.view);
          } else {
            // Clear expired data
            sessionStorage.removeItem("calendar-view-selection");
          }
        } catch (e) {
          // Handle legacy format or invalid JSON
          console.warn("Invalid calendar view data in sessionStorage");
          sessionStorage.removeItem("calendar-view-selection");
        }
      }

      if (!validSavedView && isMobile) {
        // On mobile, always default to day view regardless of initialView
        setViewState("day");
        // Notify parent about the view change
        onViewChange?.("day");
      }
    }
  }, [isMobile, onViewChange]);

  // Custom setView function that also saves to sessionStorage with expiration and notifies parent
  const setView = (newView: CalendarView) => {
    setViewState(newView);
    if (typeof window !== "undefined") {
      // Save view with expiration time (1 hour from now)
      const expirationTime = new Date();
      expirationTime.setHours(expirationTime.getHours() + 1);
      const viewData = {
        view: newView,
        expires: expirationTime.getTime(),
      };
      sessionStorage.setItem(
        "calendar-view-selection",
        JSON.stringify(viewData),
      );
    }
    // Notify parent component about view change
    onViewChange?.(newView);
  };

  // Add keyboard shortcuts for view changes
  useDropdownShortcuts([
    { key: "m", action: () => setView("month") },
    { key: "w", action: () => setView("week") },
    { key: "d", action: () => setView("day") },
    { key: "a", action: () => setView("agenda") },
  ]);

  // Notify parent about the initial view on mount
  useEffect(() => {
    onViewChange?.(view);
  }, []);

  // Update view when initialView changes from external source (like bottom nav)
  useEffect(() => {
    if (initialView && initialView !== view) {
      setViewState(initialView);
      if (typeof window !== "undefined") {
        const expirationTime = new Date();
        expirationTime.setHours(expirationTime.getHours() + 1);
        sessionStorage.setItem(
          "calendar-view-selection",
          JSON.stringify({
            view: initialView,
            expires: expirationTime.getTime(),
          }),
        );
      }
    }
  }, [initialView, view]);

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

  // Notify parent of date range changes
  useEffect(() => {
    onDateRangeChange?.(dateRange);
  }, [dateRange, onDateRangeChange]);

  // Use the provided event handlers with fallbacks
  const createEvent = onCreateEvent || (async () => {});
  const updateEvent = onUpdateEvent || (async () => {});
  const deleteEvent = onDeleteEvent || (async () => {});

  // Navigation handlers
  const handlePrevious = () => {
    let newDate: Date;

    if (view === "month") {
      newDate = subMonths(currentDate, 1);
    } else if (view === "week") {
      newDate = subWeeks(currentDate, 1);
    } else if (view === "day") {
      newDate = addDays(currentDate, -1);
    } else if (view === "agenda") {
      newDate = addDays(currentDate, -AgendaDaysToShow);
    } else {
      newDate = subMonths(currentDate, 1);
    }

    if (newDate) setCurrentDate(newDate);
  };

  const handleNext = () => {
    let newDate: Date;

    if (view === "month") {
      newDate = addMonths(currentDate, 1);
    } else if (view === "week") {
      newDate = addWeeks(currentDate, 1);
    } else if (view === "day") {
      newDate = addDays(currentDate, 1);
    } else if (view === "agenda") {
      newDate = addDays(currentDate, AgendaDaysToShow);
    } else {
      newDate = addMonths(currentDate, 1);
    }

    if (newDate) setCurrentDate(newDate);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleEventSelect = (event: CalendarEvent) => {
    // Open command palette with event to edit
    onEventEdit?.(event);
  };

  const handleEventCreate = (startTime: Date) => {
    // Keep exact time without rounding to intervals
    // Just reset seconds and milliseconds for consistency
    startTime.setSeconds(0);
    startTime.setMilliseconds(0);

    const newEvent: CalendarEvent = {
      id: undefined as any, // This ensures it's treated as a new event
      title: "",
      start: startTime,
      end: addMinutesToDate(startTime, defaultEventDuration),
      allDay: false,
      calendarId: defaultCalendarId || "",
      userId: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    // Open command palette with new event
    onEventEdit?.(newEvent);
  };

  const handleEventSave = async (
    event: CalendarEvent,
  ): Promise<CalendarEvent> => {
    try {
      const eventData = {
        title: event.title,
        description: event.description,
        start: event.start.toISOString(),
        end: event.end.toISOString(),
        allDay: event.allDay || false,
        location: event.location,
        color: event.color,
        calendarId: event.calendarId,
        categoryId: (event as any).categoryId || undefined,
        reminder: event.reminder,
      };

      let savedEvent: any;
      if (event.id) {
        savedEvent = await updateEvent(event.id, eventData);
        toast.success(`Event "${event.title}" updated`, {
          description: format(new Date(event.start), "MMM d, yyyy 'at' h:mm a"),
          position: "bottom-left",
        });
      } else {
        savedEvent = await createEvent(eventData);
        toast.success(`Event "${event.title}" created`, {
          description: format(new Date(event.start), "MMM d, yyyy 'at' h:mm a"),
          position: "bottom-left",
        });
      }

      return savedEvent || event;
    } catch (error: any) {
      console.error("Failed to save event:", error);

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

      if (deletedEvent) {
        toast.success(`Event "${deletedEvent.title}" deleted`, {
          description: format(new Date(deletedEvent.start), "MMM d, yyyy"),
          position: "bottom-left",
        });
      }
    } catch (error: any) {
      console.error("Failed to delete event:", error);
      const errorMessage = error?.message || "Failed to delete event";
      toast.error("Failed to delete event", {
        description: errorMessage,
        position: "bottom-left",
      });
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

      toast.success(`Event "${updatedEvent.title}" moved`, {
        description: format(
          new Date(updatedEvent.start),
          "MMM d, yyyy 'at' h:mm a",
        ),
        position: "bottom-left",
      });
    } catch (error: any) {
      console.error("Failed to update event:", error);
      const errorMessage = error?.message || "Failed to move event";
      toast.error("Failed to move event", {
        description: errorMessage,
        position: "bottom-left",
      });
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

  // Show skeleton only for initial structure loading (calendars/categories)
  // Events can load separately without blocking the calendar UI
  if (loading) {
    return (
      <div className={cn("rounded-lg", className)}>
        <CalendarSkeleton view={view} compactView={compactView} />
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-destructive mb-2">Failed to load calendar</p>
          <p className="text-sm text-muted-foreground">{error.message}</p>
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
            // Enhanced mobile-responsive week cell height
            "--week-cells-height": `${
              compactView
                ? Math.round(WeekCellsHeight * 0.85)
                : typeof window !== "undefined" && window.innerWidth < 640
                  ? Math.round(WeekCellsHeight * 0.9) // Slightly more compact on mobile
                  : WeekCellsHeight
            }px`,
          } as React.CSSProperties
        }
      >
        <CalendarDndProvider
          onEventUpdate={handleEventUpdate}
          timezone={timezone}
        >
          {/* Desktop-only calendar header - hidden on mobile since we have mobile nav */}
          <div className="hidden md:flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-5 sm:px-4">
            <div className="flex sm:flex-col max-sm:items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5">
                <h2 className="font-semibold text-xl">{viewTitle}</h2>
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
                    const startTime = new Date(currentDate);
                    const now = new Date();

                    if (startTime.toDateString() === now.toDateString()) {
                      startTime.setHours(
                        now.getHours(),
                        now.getMinutes(),
                        0,
                        0,
                      );
                    } else {
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
                      Month <DropdownMenuShortcut>⌘+M</DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setView("week")}>
                      Week <DropdownMenuShortcut>⌘+W</DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setView("day")}>
                      Day <DropdownMenuShortcut>⌘+D</DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setView("agenda")}>
                      Agenda <DropdownMenuShortcut>⌘+A</DropdownMenuShortcut>
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
                timezone={timezone}
              />
            )}
            {view === "week" &&
              (isMobile ? (
                <MobileWeekView
                  currentDate={currentDate}
                  events={events}
                  onEventSelect={handleEventSelect}
                  onEventCreate={handleEventCreate}
                  timeFormat={timeFormat}
                  weekStartDay={weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6}
                  workingDays={workingDays}
                  timezone={timezone}
                  showMonthPicker={true}
                />
              ) : (
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
              ))}
            {view === "day" &&
              (isMobile ? (
                <MobileDayView
                  currentDate={currentDate}
                  events={events}
                  onEventSelect={handleEventSelect}
                  onEventCreate={handleEventCreate}
                  timeFormat={timeFormat}
                  timezone={timezone}
                  workingDays={workingDays}
                  showMonthPicker={true}
                  weekStartDay={weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6}
                />
              ) : (
                <DayView
                  currentDate={currentDate}
                  events={events}
                  onEventSelect={handleEventSelect}
                  onEventCreate={handleEventCreate}
                  compactView={compactView}
                  timeFormat={timeFormat}
                  workingDays={workingDays}
                  timezone={timezone}
                />
              ))}
            {view === "agenda" && (
              <AgendaView
                currentDate={currentDate}
                events={events}
                onEventSelect={handleEventSelect}
                onEventCreate={handleEventCreate}
                timeFormat={timeFormat}
                timezone={timezone}
              />
            )}
          </div>
        </CalendarDndProvider>
      </div>
    </ErrorBoundary>
  );
}
