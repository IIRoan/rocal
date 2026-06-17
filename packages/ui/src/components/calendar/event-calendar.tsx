"use client";

import { useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import { createLogger } from "@workspace/logger";
import {
  canCurrentUserDeleteEvent,
  canCurrentUserEditEvent,
} from "@workspace/calendar-core";
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
  AlignJustify,
  ChevronRightIcon,
  Columns3,
  Eye,
  LayoutGrid,
  Loader2,
  Pencil,
  Plus,
  Square,
  Trash2,
} from "lucide-react";
import { ListIcon } from "@phosphor-icons/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
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

const AgendaView = dynamic(
  () => import("./agenda-view").then((mod) => mod.AgendaView),
  {
    ssr: false,
    loading: () => (
      <EventLoadingSkeleton
        view="agenda"
        compactView={false}
        className="absolute inset-0 z-10"
      />
    ),
  },
);
const DayView = dynamic(() => import("./day-view").then((mod) => mod.DayView), {
  ssr: false,
  loading: () => (
    <EventLoadingSkeleton
      view="day"
      compactView={false}
      className="absolute inset-0 z-10"
    />
  ),
});
const ThreeDayView = dynamic(
  () =>
    import("./mobile-three-day-view").then((mod) => mod.MobileThreeDayView),
  {
    ssr: false,
    loading: () => (
      <EventLoadingSkeleton
        view="3day"
        compactView={false}
        className="absolute inset-0 z-10"
      />
    ),
  },
);
const MonthView = dynamic(
  () => import("./month-view").then((mod) => mod.MonthView),
  {
    ssr: false,
    loading: () => (
      <EventLoadingSkeleton
        view="month"
        compactView={false}
        className="absolute inset-0 z-10"
      />
    ),
  },
);
const WeekView = dynamic(
  () => import("./week-view").then((mod) => mod.WeekView),
  {
    ssr: false,
    loading: () => (
      <EventLoadingSkeleton
        view="week"
        compactView={false}
        className="absolute inset-0 z-10"
      />
    ),
  },
);
import { EventNotification } from "./notification-manager";
import { CalendarDndProvider } from "./calendar-dnd-context";
import { CalendarSkeleton } from "./calendar-skeleton";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { ErrorBoundary } from "../ui/error-boundary";
import { AppLoadingState } from "../ui/app-loading-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Separator } from "../ui/separator";
import { useDropdownShortcuts } from "../../hooks";
import { usePrefersReducedMotion } from "../../hooks/use-prefers-reduced-motion";
import { gsap, useGSAP } from "../../lib/gsap";

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
  const { currentDate, setCurrentDate, currentView, setCurrentView } =
    useCalendarContext();

  // Use context view, falling back to initialView on first render if context hasn't been set
  const view = currentView;

  // Defer event layout so grid structure can paint at the new date first
  const deferredEvents = useDeferredValue(events);

  // Initialize context view from initialView if context is still at default
  useEffect(() => {
    if (currentView === "month" && initialView !== "month") {
      // Check if sessionStorage has a saved view first
      if (typeof window !== "undefined") {
        const savedViewData = sessionStorage.getItem("calendar-view-selection");
        if (savedViewData) {
          try {
            const parsedData = JSON.parse(savedViewData);
            if (
              parsedData.expires &&
              parsedData.expires > Date.now() &&
              (CALENDAR_VIEWS as readonly string[]).includes(parsedData.view)
            ) {
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
            if (
              parsedData.expires &&
              parsedData.expires > Date.now() &&
              (CALENDAR_VIEWS as readonly string[]).includes(parsedData.view)
            ) {
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
    { key: "t", action: () => setView("3day") },
    { key: "d", action: () => setView("day") },
    { key: "a", action: () => setView("agenda") },
  ]);

  // Compute the date range for a given date and view
  const computeDateRange = (date: Date, v: string) => {
    let start: Date;
    let end: Date;
    if (v === "month") {
      const monthStart = startOfMonth(date);
      const monthEnd = endOfMonth(date);
      start = startOfWeek(monthStart, {
        weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      });
      end = endOfWeek(monthEnd, {
        weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      });
    } else if (v === "week") {
      start = startOfWeek(date, {
        weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      });
      end = endOfWeek(date, {
        weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      });
    } else if (v === "day") {
      start = new Date(date);
      start.setHours(0, 0, 0, 0);
      end = new Date(date);
      end.setHours(23, 59, 59, 999);
    } else if (v === "agenda") {
      start = new Date(date);
      end = addDays(date, AgendaDaysToShow - 1);
    } else {
      start = startOfMonth(date);
      end = endOfMonth(date);
    }
    return { start, end };
  };

  // Calculate date range based on current view and date
  const dateRange = useMemo(
    () => computeDateRange(currentDate, view),
    [currentDate, view],
  );

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

  // Notify parent of date range changes (fallback for view changes, external date changes, etc.)
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
  const shouldReduceMotion = usePrefersReducedMotion();
  const viewStageRef = useRef<HTMLDivElement>(null);

  // Navigate and eagerly start the fetch in the same React batch
  const navigateTo = (newDate: Date) => {
    setCurrentDate(newDate);
    onDateRangeChange?.(computeDateRange(newDate, view));
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
      newDate = addDays(currentDate, -AgendaDaysToShow);
    }

    if (newDate) navigateTo(newDate);
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
      newDate = addDays(currentDate, AgendaDaysToShow);
    }

    if (newDate) navigateTo(newDate);
  };

  const prefetchAdjacentRange = (direction: "prev" | "next") => {
    if (!onPrefetchRange) return;
    const offset = direction === "next" ? 1 : -1;
    let start: Date;
    let end: Date;
    if (view === "month" || view === "agenda") {
      const base =
        direction === "next"
          ? addMonths(currentDate, offset)
          : addMonths(currentDate, offset);
      start = startOfMonth(base);
      end = endOfMonth(base);
    } else if (view === "week") {
      start = startOfWeek(addWeeks(currentDate, offset), {
        weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      });
      end = endOfWeek(start, {
        weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      });
    } else {
      // day / 3day
      const base = addDays(currentDate, offset);
      start = new Date(base);
      start.setHours(0, 0, 0, 0);
      end = new Date(base);
      end.setHours(23, 59, 59, 999);
    }
    onPrefetchRange({ start, end });
  };

  const handleToday = () => {
    navDirectionRef.current = currentDate < new Date() ? 1 : -1;
    navigateTo(new Date());
  };

  const calendarViewKey = `${view}-${format(
    currentDate,
    view === "day" ? "yyyy-MM-dd" : view === "week" ? "yyyy-ww" : "yyyy-MM",
  )}`;
  const canAnimateCalendar = !loading && !error;

  useGSAP(
    () => {
      if (!canAnimateCalendar) {
        return;
      }

      const node = viewStageRef.current;

      if (!node) {
        return;
      }

      if (shouldReduceMotion) {
        gsap.set(node, { clearProps: "opacity,transform" });
        return;
      }

      gsap.fromTo(
        node,
        {
          x: navDirectionRef.current > 0 ? 32 : -32,
          autoAlpha: 0,
        },
        {
          x: 0,
          autoAlpha: 1,
          duration: 0.28,
          ease: "power3.out",
          overwrite: "auto",
        },
      );
    },
    {
      dependencies: [calendarViewKey, canAnimateCalendar, shouldReduceMotion],
      scope: viewStageRef,
    },
  );

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
      const event = events.find(
        (item) => item.id === eventElement.dataset.eventId,
      );
      if (event) {
        onSetPreview?.(null);
        reopenContextMenuAt({ type: "event", event }, e.clientX, e.clientY);
        return;
      }
    }

    const cellElement = target.closest<HTMLElement>(
      "[data-calendar-cell='true']",
    );
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
            <span className="text-muted-foreground">
              {" "}
              {format(end, "yyyy")}
            </span>
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
            <span className="text-muted-foreground">
              {" "}
              {format(end, "yyyy")}
            </span>
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
              {eventsLoading && (
                <AppLoadingState
                  variant="inline-icon"
                  size="sm"
                  className="shrink-0"
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center rounded-md border border-border/60 bg-background shadow-xs overflow-hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-none text-muted-foreground/70 hover:text-foreground hover:bg-accent/60 -scale-x-[1]"
                  onClick={handlePrevious}
                  onMouseEnter={() => prefetchAdjacentRange("prev")}
                  aria-label="Previous"
                  disabled={loading}
                >
                  <ChevronRightIcon size={16} aria-hidden="true" />
                </Button>
                <Separator orientation="vertical" className="h-4" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleToday}
                  disabled={loading}
                  className="h-7 px-3 rounded-none text-xs font-medium hover:bg-accent/60"
                >
                  Today
                </Button>
                <Separator orientation="vertical" className="h-4" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-none text-muted-foreground/70 hover:text-foreground hover:bg-accent/60"
                  onClick={handleNext}
                  onMouseEnter={() => prefetchAdjacentRange("next")}
                  aria-label="Next"
                  disabled={loading}
                >
                  <ChevronRightIcon size={16} aria-hidden="true" />
                </Button>
              </div>
              <div
                role="radiogroup"
                aria-label="Calendar view"
                className="inline-flex items-center rounded-md border border-border/60 bg-background shadow-xs p-0.5 gap-0.5"
              >
                {(
                  [
                    {
                      value: "month",
                      label: "Month",
                      icon: LayoutGrid,
                      shortcut: "M",
                    },
                    {
                      value: "week",
                      label: "Week",
                      icon: Columns3,
                      shortcut: "W",
                    },
                    {
                      value: "3day",
                      label: "3 Days",
                      icon: Columns3,
                      shortcut: "T",
                    },
                    { value: "day", label: "Day", icon: Square, shortcut: "D" },
                    {
                      value: "agenda",
                      label: "Agenda",
                      icon: AlignJustify,
                      shortcut: "A",
                    },
                  ] as const
                ).map(({ value, label, icon: Icon, shortcut }) => {
                  const active = view === value;
                  return (
                    <Tooltip key={value}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={active}
                          aria-label={label}
                          disabled={loading}
                          onClick={() => setView(value as CalendarView)}
                          className={cn(
                            "inline-flex items-center justify-center h-6 w-7 rounded-sm transition-colors",
                            "text-muted-foreground/70 hover:text-foreground hover:bg-accent/60",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            "disabled:opacity-50 disabled:pointer-events-none",
                            active &&
                              "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground shadow-sm",
                          )}
                        >
                          <Icon size={14} aria-hidden="true" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        {label}
                        <span className="ml-1.5 opacity-60">{shortcut}</span>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col relative min-h-0 overflow-hidden">
            <div
              key={calendarViewKey}
              ref={viewStageRef}
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
                  events={deferredEvents}
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
                  events={deferredEvents}
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
                  events={deferredEvents}
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
              {view === "3day" && (
                <ThreeDayView
                  currentDate={currentDate}
                  events={deferredEvents}
                  onEventSelect={handleEventSelect}
                  onEventCreate={handleEventCreate}
                  timeFormat={timeFormat}
                  weekStartDay={weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6}
                  workingDays={workingDays}
                  timezone={timezone}
                />
              )}
              {view === "agenda" && (
                <AgendaView
                  currentDate={currentDate}
                  events={deferredEvents}
                  onEventSelect={handleEventSelect}
                  timeFormat={timeFormat}
                  timezone={timezone}
                  onEventEdit={onEventEdit}
                  onEventDelete={(event) => handleEventDelete(event.id)}
                  onEventView={onEventEdit}
                />
              )}
            </div>
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
                {canCurrentUserEditEvent(contextTarget.event) ? (
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
                ) : null}
                {canCurrentUserDeleteEvent(contextTarget.event) ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() =>
                        handleEventDelete(contextTarget.event.id)
                      }
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </DropdownMenuItem>
                  </>
                ) : null}
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
