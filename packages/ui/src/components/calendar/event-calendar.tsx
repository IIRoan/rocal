"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createLogger } from "@workspace/logger";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
  eachDayOfInterval,
  isToday,
} from "date-fns";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { ListIcon } from "@phosphor-icons/react";
import { toast } from "sonner";

const log = createLogger("event-calendar");

import {
  AgendaDaysToShow,
  DefaultStartHour,
  EventGap,
  EventHeight,
  WeekCellsHeight,
} from "./constants";
import { addHoursToDate, addMinutesToDate } from "./utils";
import { CalendarEvent, CalendarView, CALENDAR_VIEWS } from "./types";
import dynamic from "next/dynamic";
import { EventLoadingSkeleton } from "./event-loading-skeleton";

const AgendaView = dynamic(() => import("./agenda-view").then((mod) => mod.AgendaView), {
  ssr: false,
  loading: () => <EventLoadingSkeleton view="agenda" compactView={false} className="absolute inset-0 z-10" />
});
const DayView = dynamic(() => import("./day-view").then((mod) => mod.DayView), {
  ssr: false,
  loading: () => <EventLoadingSkeleton view="day" compactView={false} className="absolute inset-0 z-10" />
});
const MonthView = dynamic(() => import("./month-view").then((mod) => mod.MonthView), {
  ssr: false,
  loading: () => <EventLoadingSkeleton view="month" compactView={false} className="absolute inset-0 z-10" />
});
const WeekView = dynamic(() => import("./week-view").then((mod) => mod.WeekView), {
  ssr: false,
  loading: () => <EventLoadingSkeleton view="week" compactView={false} className="absolute inset-0 z-10" />
});
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
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useDropdownShortcuts } from "../../hooks";

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
      eventViewMode?: "view" | "edit";
    },
  ) => void;
  // Preview event callback for showing ghost events (e.g. during right-click context menu)
  onSetPreview?: (event: CalendarEvent | null) => void;
  // Custom sidebar toggle handler for mobile
  onSidebarToggle?: () => void;
  // Prefetch a date range (e.g. on hover of prev/next buttons)
  onPrefetchRange?: (range: { start: Date; end: Date }) => void;
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
  onSetPreview,
  onSidebarToggle,
  onPrefetchRange,
}: EventCalendarProps) {
  type ContextTarget =
    | { type: "event"; event: CalendarEvent }
    | { type: "timeline"; startTime: Date }
    | { type: "general" };

  // Use the shared calendar context instead of local state
  const { currentDate, setCurrentDate, currentView, setCurrentView } = useCalendarContext();

  // Use context view, falling back to initialView on first render if context hasn't been set
  const view = currentView;

  // Initialize context view from initialView if context is still at default
  useEffect(() => {
    if (currentView === "month" && initialView !== "month") {
      // Check if sessionStorage has a saved view first
      if (typeof window !== "undefined") {
        const savedViewData = sessionStorage.getItem("calendar-view-selection");
        if (savedViewData) {
          try {
            const parsedData = JSON.parse(savedViewData);
            if (parsedData.expires && parsedData.expires > Date.now() && (CALENDAR_VIEWS as readonly string[]).includes(parsedData.view)) {
              setCurrentView(parsedData.view as CalendarView);
              return;
            }
          } catch {
            // ignore
          }
        }
      }
      setCurrentView(initialView);
    } else if (currentView === "month") {
      // Even if initialView is "month", check sessionStorage
      if (typeof window !== "undefined") {
        const savedViewData = sessionStorage.getItem("calendar-view-selection");
        if (savedViewData) {
          try {
            const parsedData = JSON.parse(savedViewData);
            if (parsedData.expires && parsedData.expires > Date.now() && (CALENDAR_VIEWS as readonly string[]).includes(parsedData.view)) {
              setCurrentView(parsedData.view as CalendarView);
              return;
            }
          } catch {
            // ignore
          }
        }
      }
    }
  }, []); // Only run once on mount

  // Custom setView function that also saves to sessionStorage
  const setView = (newView: CalendarView) => {
    setCurrentView(newView);
    if (typeof window !== "undefined") {
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
  };

  const [contextTarget, setContextTarget] = useState<ContextTarget>({
    type: "general",
  });
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({
    x: 0,
    y: 0,
  });
  const contextMenuRafRef = useRef<number | null>(null);

  // Add keyboard shortcuts for view changes
  useDropdownShortcuts([
    { key: "m", action: () => setView("month") },
    { key: "w", action: () => setView("week") },
    { key: "d", action: () => setView("day") },
    { key: "a", action: () => setView("agenda") },
  ]);

  // Calculate date range based on current view and date
  const dateRange = useMemo(() => {
    let start: Date;
    let end: Date;

    if (view === "month") {
      // Expand to full calendar grid (start/end of weeks around the month)
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      start = startOfWeek(monthStart, {
        weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      });
      end = endOfWeek(monthEnd, {
        weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      });
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

  // Calculate days for week view (needed for day headers)
  const days = useMemo(() => {
    if (view !== "week") return [];
    const start = startOfWeek(currentDate, {
      weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    });
    const end = endOfWeek(currentDate, {
      weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    });
    return eachDayOfInterval({ start, end });
  }, [currentDate, view, weekStartDay]);

  // Notify parent of date range changes
  useEffect(() => {
    onDateRangeChange?.(dateRange);
  }, [dateRange, onDateRangeChange]);

  // Use the provided event handlers with fallbacks
  const createEvent = onCreateEvent || (async () => {});
  const updateEvent = onUpdateEvent || (async () => {});
  const deleteEvent = onDeleteEvent || (async () => {});
  const createCategory = onCreateCategory || (async () => {});

  // Add keyboard shortcuts for view switching
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input, textarea or contentEditable element
      if (
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
  }, []);

  const navDirectionRef = useRef<1 | -1>(1);
  const shouldReduceMotion = useReducedMotion();

  const viewTransitionVariants = {
    enter: (dir: number) => ({
      x: shouldReduceMotion ? 0 : dir > 0 ? 56 : -56,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: shouldReduceMotion ? 0 : dir > 0 ? -40 : 40,
      opacity: 0,
    }),
  };

  const handlePrevious = () => {
    navDirectionRef.current = -1;
    let newDate;
    if (view === "month") {
      newDate = subMonths(currentDate, 1);
    } else if (view === "week") {
      newDate = subWeeks(currentDate, 1);
    } else if (view === "day") {
      newDate = addDays(currentDate, -1);
    } else if (view === "agenda") {
      // For agenda view, go back 30 days (a full month)
      newDate = addDays(currentDate, -AgendaDaysToShow);
    }

    if (newDate) setCurrentDate(newDate);
  };

  const handleNext = () => {
    navDirectionRef.current = 1;
    let newDate;
    if (view === "month") {
      newDate = addMonths(currentDate, 1);
    } else if (view === "week") {
      newDate = addWeeks(currentDate, 1);
    } else if (view === "day") {
      newDate = addDays(currentDate, 1);
    } else if (view === "agenda") {
      // For agenda view, go forward 30 days (a full month)
      newDate = addDays(currentDate, AgendaDaysToShow);
    }

    if (newDate) setCurrentDate(newDate);
  };

  const prefetchAdjacentRange = (direction: "prev" | "next") => {
    if (!onPrefetchRange) return;
    const offset = direction === "next" ? 1 : -1;
    let start: Date;
    let end: Date;
    if (view === "month" || view === "agenda") {
      const base = direction === "next" ? addMonths(currentDate, offset) : addMonths(currentDate, offset);
      start = startOfMonth(base);
      end = endOfMonth(base);
    } else if (view === "week") {
      start = startOfWeek(addWeeks(currentDate, offset), { weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6 });
      end = endOfWeek(start, { weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6 });
    } else {
      // day / 3day
      const base = addDays(currentDate, offset);
      start = new Date(base); start.setHours(0, 0, 0, 0);
      end = new Date(base); end.setHours(23, 59, 59, 999);
    }
    onPrefetchRange({ start, end });
  };

  const handleToday = () => {
    navDirectionRef.current = currentDate < new Date() ? 1 : -1;
    setCurrentDate(new Date());
  };

  // Track last mouse click position for popover positioning on timeline clicks
  const lastClickPositionRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      lastClickPositionRef.current = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  useEffect(() => {
    return () => {
      if (contextMenuRafRef.current !== null) {
        cancelAnimationFrame(contextMenuRafRef.current);
      }
    };
  }, []);

  const reopenContextMenuAt = (target: ContextTarget, x: number, y: number) => {
    setContextTarget(target);
    setContextMenuPosition({ x, y });
    setContextMenuOpen(false);

    if (contextMenuRafRef.current !== null) {
      cancelAnimationFrame(contextMenuRafRef.current);
    }

    contextMenuRafRef.current = requestAnimationFrame(() => {
      setContextMenuOpen(true);
      contextMenuRafRef.current = null;
    });
  };

  const handleCalendarContextMenuCapture = (
    e: React.MouseEvent<HTMLDivElement>,
  ) => {
    e.preventDefault();
    lastClickPositionRef.current = { x: e.clientX, y: e.clientY };

    const target = e.target as HTMLElement;
    const eventElement = target.closest<HTMLElement>("[data-event-id]");

    if (eventElement?.dataset.eventId) {
      const event = events.find((item) => item.id === eventElement.dataset.eventId);
      if (event) {
        onSetPreview?.(null);
        reopenContextMenuAt({ type: "event", event }, e.clientX, e.clientY);
        return;
      }
    }

    const cellElement = target.closest<HTMLElement>("[data-calendar-cell='true']");
    if (cellElement?.dataset.cellDate) {
      const startTime = new Date(cellElement.dataset.cellDate);
      const timeValue = Number(cellElement.dataset.cellTime);

      if (!Number.isNaN(timeValue)) {
        const hours = Math.floor(timeValue);
        const minutes = Math.round((timeValue - hours) * 60);
        startTime.setHours(hours, minutes, 0, 0);
      } else {
        startTime.setHours(DefaultStartHour, 0, 0, 0);
      }

      // Show a preview event at the right-clicked position
      startTime.setSeconds(0);
      startTime.setMilliseconds(0);
      const previewEvent: CalendarEvent = {
        id: "__context_preview__" as any,
        title: "",
        start: new Date(startTime),
        end: addMinutesToDate(startTime, defaultEventDuration),
        allDay: false,
        calendarId: defaultCalendarId || "",
        userId: "",
        createdAt: new Date(),
        updatedAt: new Date(),
        isPreview: true,
      };
      onSetPreview?.(previewEvent);

      reopenContextMenuAt(
        { type: "timeline", startTime },
        e.clientX,
        e.clientY,
      );
      return;
    }

    // Clear any existing preview for non-timeline right-clicks
    onSetPreview?.(null);

    reopenContextMenuAt({ type: "general" }, e.clientX, e.clientY);
  };

  const handleEventSelect = (event: CalendarEvent) => {
    // Open command palette with event to edit (always modal for existing events)
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
      end: addMinutesToDate(startTime, defaultEventDuration), // Use default duration from settings
      allDay: false,
      calendarId: defaultCalendarId || "",
      userId: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    // Open as popover near the click position (for timeline cell clicks)
    const anchorPos = lastClickPositionRef.current;
    if (anchorPos) {
      onEventEdit?.(newEvent, { mode: "popover", anchorPosition: anchorPos });
    } else {
      onEventEdit?.(newEvent);
    }
  };

  // Create event from button (always modal, no popover)
  const handleButtonEventCreate = (startTime: Date) => {
    startTime.setSeconds(0);
    startTime.setMilliseconds(0);

    const newEvent: CalendarEvent = {
      id: undefined as any,
      title: "",
      start: startTime,
      end: addMinutesToDate(startTime, defaultEventDuration),
      allDay: false,
      calendarId: defaultCalendarId || "",
      userId: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    // Always open as modal for button-triggered creation
    onEventEdit?.(newEvent, { mode: "modal" });
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

      // No longer needed as we use command palette

      // Return the saved event, or the original event if savedEvent is undefined
      return savedEvent || event;
    } catch (error: any) {
      log.error("Failed to save event:", error);

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

      // No longer needed as we use command palette

      // Show success toast notification when an event is deleted
      if (deletedEvent) {
        toast.success(`Event "${deletedEvent.title}" deleted`, {
          description: format(new Date(deletedEvent.start), "MMM d, yyyy"),
          position: "bottom-left",
        });
      }
    } catch (error: any) {
      log.error("Failed to delete event:", error);

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
          "MMM d, yyyy 'at' h:mm a",
        ),
        position: "bottom-left",
      });
    } catch (error: any) {
      log.error("Failed to update event:", error);

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
    const formatMonthYear = (date: Date) => (
      <>
        <span className="font-bold">{format(date, "MMMM")}</span>
        <span className="text-muted-foreground"> {format(date, "yyyy")}</span>
      </>
    );

    if (view === "month") {
      return formatMonthYear(currentDate);
    } else if (view === "week") {
      const start = startOfWeek(currentDate, {
        weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      });
      const end = endOfWeek(currentDate, {
        weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      });
      if (isSameMonth(start, end)) {
        return formatMonthYear(start);
      } else {
        return (
          <>
            <span className="font-bold">{format(start, "MMM")}</span>
            <span className="text-muted-foreground"> - </span>
            <span className="font-bold">{format(end, "MMM")}</span>
            <span className="text-muted-foreground"> {format(end, "yyyy")}</span>
          </>
        );
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
        return formatMonthYear(start);
      } else {
        return (
          <>
            <span className="font-bold">{format(start, "MMM")}</span>
            <span className="text-muted-foreground"> - </span>
            <span className="font-bold">{format(end, "MMM")}</span>
            <span className="text-muted-foreground"> {format(end, "yyyy")}</span>
          </>
        );
      }
    } else {
      return formatMonthYear(currentDate);
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
        log.error("Calendar error:", error, errorInfo);
        toast.error("Calendar encountered an error. Please refresh the page.");
      }}
    >
      <div
        className={cn(
          "flex has-data-[slot=month-view]:flex-1 flex-col rounded-lg relative h-full",
          className,
        )}
        style={
          {
            "--event-height": `${compactView ? Math.round(EventHeight * 0.75) : EventHeight}px`,
            "--event-gap": `${compactView ? Math.round(EventGap * 0.5) : EventGap}px`,
            "--week-cells-height": `${compactView ? Math.round(WeekCellsHeight * 0.85) : WeekCellsHeight}px`,
            "--calendar-toolbar-height": "52px",
            "--calendar-toolbar-height-sm": "56px",
          } as React.CSSProperties
        }
        onContextMenuCapture={handleCalendarContextMenuCapture}
      >
        <CalendarDndProvider
          onEventUpdate={handleEventUpdate}
          timezone={timezone}
        >
          <div
            className={
              "z-50 h-[var(--calendar-toolbar-height)] sm:h-[var(--calendar-toolbar-height-sm)] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center justify-between gap-2 px-2 sm:px-4 shrink-0"
            }
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {onSidebarToggle && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="peer size-7 text-muted-foreground/80 hover:text-foreground/80 hover:bg-transparent! sm:-ms-1.5"
                  onClick={onSidebarToggle}
                >
                  <ListIcon size={16} />
                  <span className="sr-only">Toggle Sidebar</span>
                </Button>
              )}
              <h2 className="min-w-0 truncate font-semibold text-base sm:text-xl transition-transform ease-in-out duration-300">
                {viewTitle}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground/70 hover:text-foreground hover:bg-accent/50 -scale-x-[1]"
                  onClick={handlePrevious}
                  onMouseEnter={() => prefetchAdjacentRange("prev")}
                  aria-label="Previous"
                  disabled={loading}
                >
                  <ChevronRightIcon size={16} aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground/70 hover:text-foreground hover:bg-accent/50"
                  onClick={handleNext}
                  onMouseEnter={() => prefetchAdjacentRange("next")}
                  aria-label="Next"
                  disabled={loading}
                >
                  <ChevronRightIcon size={16} aria-hidden="true" />
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  className="h-8 px-3 rounded-lg border-border/50 text-[13px] font-medium text-foreground hover:bg-accent"
                  onClick={handleToday}
                  disabled={loading}
                >
                  Today
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="gap-1.5 h-8 rounded-lg border-border/50 text-[13px] font-medium text-foreground hover:bg-accent"
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
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col relative min-h-0 overflow-hidden">
            {/* Event loading overlay when navigating between dates */}
            {eventsLoading && events && events.length > 0 && (
              <EventLoadingSkeleton
                view={view}
                compactView={compactView}
                className="absolute inset-0 z-10"
              />
            )}

            <AnimatePresence
              mode="sync"
              custom={navDirectionRef.current}
              initial={false}
            >
              <motion.div
                key={`${view}-${format(currentDate, view === "day" ? "yyyy-MM-dd" : view === "week" ? "yyyy-ww" : "yyyy-MM")}`}
                custom={navDirectionRef.current}
                variants={viewTransitionVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  x: {
                    type: "spring",
                    stiffness: 340,
                    damping: 34,
                    mass: 0.8,
                  },
                  opacity: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
                }}
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  willChange: "transform, opacity",
                }}
              >
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
                    onEventEdit={onEventEdit}
                    onEventDelete={(event) => handleEventDelete(event.id)}
                    onEventView={onEventEdit}
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
                    onEventEdit={onEventEdit}
                    onEventDelete={(event) => handleEventDelete(event.id)}
                    onEventView={onEventEdit}
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
                    onEventEdit={onEventEdit}
                    onEventDelete={(event) => handleEventDelete(event.id)}
                    onEventView={onEventEdit}
                  />
                )}
                {view === "agenda" && (
                  <AgendaView
                    currentDate={currentDate}
                    events={events}
                    onEventSelect={handleEventSelect}
                    timeFormat={timeFormat}
                    timezone={timezone}
                    onEventEdit={onEventEdit}
                    onEventDelete={(event) => handleEventDelete(event.id)}
                    onEventView={onEventEdit}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Event editing now handled by command palette */}
        </CalendarDndProvider>
      </div>

      <DropdownMenu
        open={contextMenuOpen}
        onOpenChange={(open) => {
          setContextMenuOpen(open);
          if (!open) {
            onSetPreview?.(null);
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="fixed size-px opacity-0 pointer-events-none"
            style={{
              left: contextMenuPosition.x,
              top: contextMenuPosition.y,
            }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-44">
          {contextTarget.type === "event" ? (
            contextTarget.event.isSynced ? (
              <>
                <DropdownMenuItem
                  onClick={() =>
                    onEventEdit?.(contextTarget.event, {
                      mode: "modal",
                      eventViewMode: "view",
                    })
                  }
                >
                  <Eye className="size-4" />
                  View
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  Synced calendar event - cannot edit
                </div>
              </>
            ) : (
              <>
                <DropdownMenuItem
                  onClick={() =>
                    onEventEdit?.(contextTarget.event, {
                      mode: "modal",
                      eventViewMode: "view",
                    })
                  }
                >
                  <Eye className="size-4" />
                  View
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    onEventEdit?.(contextTarget.event, {
                      mode: "modal",
                      eventViewMode: "edit",
                    })
                  }
                >
                  <Pencil className="size-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => handleEventDelete(contextTarget.event.id)}
                >
                  <Trash2 className="size-4" />
                  Delete
                </DropdownMenuItem>
              </>
            )
          ) : (
            <DropdownMenuItem
              onClick={() => {
                if (contextTarget.type === "timeline") {
                  handleEventCreate(new Date(contextTarget.startTime));
                  return;
                }

                const startTime = new Date(currentDate);
                startTime.setHours(DefaultStartHour, 0, 0, 0);
                handleEventCreate(startTime);
              }}
            >
              <Plus className="size-4" />
              Create event
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </ErrorBoundary>
  );
}
