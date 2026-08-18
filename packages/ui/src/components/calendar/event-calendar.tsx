"use client";

import { useDeferredValue, useRef } from "react";
import { createLogger } from "@workspace/logger";
import {
  getCalendarViewAnimationKey,
  getPrefetchCalendarDateRange,
  navigateCalendarDate,
  resolveTimezone,
} from "@workspace/calendar-core";
import { addDays } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useCalendarContext } from "./calendar-context";
import { CalendarDndProvider } from "./calendar-dnd-context";
import { EventCalendarContextMenu } from "./event-calendar-context-menu";
import {
  persistDeletedCalendarEvent,
  persistDraggedCalendarEvent,
} from "./event-calendar-mutations";
import { EventCalendarToolbar } from "./event-calendar-toolbar";
import { EventCalendarViewStage } from "./event-calendar-views";
import { CalendarSkeleton } from "./calendar-skeleton";
import {
  AgendaDaysToShow,
  EventGap,
  EventHeight,
  WeekCellsHeight,
} from "./constants";
import { useEventCalendarContextMenu } from "./use-event-calendar-context-menu";
import { addMinutesToDate } from "./utils";
import type { CalendarEvent, CalendarView } from "./types";
import type { EventNotification } from "./notification-manager";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { ErrorBoundary } from "../ui/error-boundary";
import { useDropdownShortcuts } from "../../hooks/use-keyboard-shortcuts";
import { usePrefersReducedMotion } from "../../hooks/use-prefers-reduced-motion";
import { gsap, useGSAP } from "../../lib/gsap";

const log = createLogger("event-calendar");

const EMPTY_CALENDAR_EVENTS: CalendarEvent[] = [];
const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];

function reloadWindow() {
  window.location.reload();
}

export interface EventCalendarProps {
  className?: string;
  initialView?: CalendarView;
  events?: CalendarEvent[];
  categories?: unknown[];
  loading?: boolean;
  eventsLoading?: boolean;
  error?: { message?: string } | null;
  onCreateEvent?: (event: unknown) => Promise<unknown>;
  onUpdateEvent?: (id: string, event: unknown) => Promise<unknown>;
  onDeleteEvent?: (id: string) => Promise<void>;
  onCreateCategory?: (category: unknown) => Promise<unknown>;
  onDateRangeChange?: (dateRange: { start: Date; end: Date }) => void;
  showWeekNumbers?: boolean;
  compactView?: boolean;
  timeFormat?: "12h" | "24h";
  defaultEventDuration?: number;
  defaultCalendarId?: string | null;
  weekStartDay?: number;
  workingDays?: number[];
  timezone?: string;
  themeSettings?: {
    currentTheme: "light" | "dark" | "system";
    updateTheme: (theme: "light" | "dark" | "system") => Promise<void>;
  };
  onLoadNotifications?: (eventId: string) => Promise<EventNotification[]>;
  onUpdateNotifications?: (
    eventId: string,
    notifications: EventNotification[],
  ) => Promise<void>;
  onEventEdit?: (
    event: CalendarEvent,
    options?: {
      mode?: "modal" | "popover";
      anchorPosition?: { x: number; y: number };
      eventViewMode?: "view" | "edit";
    },
  ) => void;
  onSetPreview?: (event: CalendarEvent | null) => void;
  onSidebarToggle?: () => void;
  onPrefetchRange?: (range: { start: Date; end: Date }) => void;
}

export function EventCalendar({
  className,
  events = EMPTY_CALENDAR_EVENTS,
  loading = false,
  eventsLoading = false,
  error = null,
  onUpdateEvent,
  onDeleteEvent,
  showWeekNumbers = false,
  compactView = false,
  timeFormat = "24h",
  defaultEventDuration = 60,
  defaultCalendarId = null,
  weekStartDay = 1,
  workingDays = DEFAULT_WORKING_DAYS,
  timezone,
  onEventEdit,
  onSetPreview,
  onSidebarToggle,
  onPrefetchRange,
}: EventCalendarProps) {
  const { currentDate, setCurrentDate, currentView, setCurrentView } =
    useCalendarContext();
  const view = currentView;
  const resolvedTimezone = resolveTimezone(timezone);
  const deferredEvents = useDeferredValue(events);
  const navDirectionRef = useRef<1 | -1>(1);
  const viewStageRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = usePrefersReducedMotion();
  const updateEvent = onUpdateEvent || (async () => {});
  const deleteEvent = onDeleteEvent || (async () => undefined);

  useDropdownShortcuts([
    { key: "m", action: () => setCurrentView("month") },
    { key: "w", action: () => setCurrentView("week") },
    { key: "t", action: () => setCurrentView("3day") },
    { key: "d", action: () => setCurrentView("day") },
    { key: "a", action: () => setCurrentView("agenda") },
  ]);

  const {
    handleContextMenuCapture,
    lastClickPositionRef,
    menuOpen,
    menuPosition,
    menuTarget,
    setMenuOpen,
  } = useEventCalendarContextMenu({
    defaultCalendarId,
    defaultEventDuration,
    events,
    onSetPreview,
    timezone,
  });

  const navigateTo = (newDate: Date) => {
    setCurrentDate(newDate);
  };

  const handlePrevious = () => {
    navDirectionRef.current = -1;
    navigateTo(
      view === "agenda"
        ? addDays(currentDate, -AgendaDaysToShow)
        : navigateCalendarDate(currentDate, view, -1),
    );
  };

  const handleNext = () => {
    navDirectionRef.current = 1;
    navigateTo(
      view === "agenda"
        ? addDays(currentDate, AgendaDaysToShow)
        : navigateCalendarDate(currentDate, view, 1),
    );
  };

  const prefetchAdjacentRange = (direction: "prev" | "next") => {
    onPrefetchRange?.(
      getPrefetchCalendarDateRange({
        currentDate,
        view,
        direction: direction === "next" ? 1 : -1,
        weekStartDay,
        timezone: resolvedTimezone,
      }),
    );
  };

  const handleToday = () => {
    navDirectionRef.current = currentDate < new Date() ? 1 : -1;
    navigateTo(new Date());
  };

  const calendarViewKey = getCalendarViewAnimationKey(
    view,
    currentDate,
    weekStartDay,
    resolvedTimezone,
  );
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

  const handleEventSelect = (event: CalendarEvent) => {
    onEventEdit?.(event);
  };

  const handleEventCreate = (startTime: Date) => {
    startTime.setSeconds(0);
    startTime.setMilliseconds(0);

    const newEvent: CalendarEvent = {
      id: undefined as unknown as string,
      title: "",
      start: startTime,
      end: addMinutesToDate(startTime, defaultEventDuration),
      allDay: false,
      calendarId: defaultCalendarId || "",
      userId: "",
      createdAt: new Date(),
      updatedAt: new Date(),
      timezone: resolvedTimezone,
    };
    const anchorPos = lastClickPositionRef.current;
    if (anchorPos) {
      onEventEdit?.(newEvent, { mode: "popover", anchorPosition: anchorPos });
      return;
    }
    onEventEdit?.(newEvent);
  };

  const handleEventDelete = (eventId: string) =>
    persistDeletedCalendarEvent({
      deleteEvent,
      eventId,
      events,
      timezone: resolvedTimezone,
    });

  const handleEventUpdate = (updatedEvent: CalendarEvent) =>
    persistDraggedCalendarEvent({
      timezone: resolvedTimezone,
      updateEvent,
      updatedEvent,
    });

  if (loading) {
    return (
      <div className={cn("rounded-lg", className)}>
        <CalendarSkeleton view={view} compactView={compactView} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-destructive mb-2">Failed to load calendar</p>
          <p className="text-sm text-muted-foreground">{error.message}</p>
          <Button variant="outline" className="mt-4" onClick={reloadWindow}>
            <Loader2 className="size-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary
      onError={(caughtError, errorInfo) => {
        log.error("Calendar error:", caughtError, errorInfo);
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
        onContextMenuCapture={handleContextMenuCapture}
      >
        <CalendarDndProvider
          onEventUpdate={handleEventUpdate}
          timezone={timezone}
        >
          <EventCalendarToolbar
            currentDate={currentDate}
            eventsLoading={eventsLoading}
            loading={loading}
            onNext={handleNext}
            onPrefetchNext={() => prefetchAdjacentRange("next")}
            onPrefetchPrevious={() => prefetchAdjacentRange("prev")}
            onPrevious={handlePrevious}
            onSidebarToggle={onSidebarToggle}
            onToday={handleToday}
            onViewChange={setCurrentView}
            timezone={resolvedTimezone}
            view={view}
            weekStartDay={weekStartDay}
          />
          <EventCalendarViewStage
            compactView={compactView}
            currentDate={currentDate}
            events={deferredEvents}
            onEventCreate={handleEventCreate}
            onEventDelete={handleEventDelete}
            onEventEdit={onEventEdit}
            onEventSelect={handleEventSelect}
            showWeekNumbers={showWeekNumbers}
            stageKey={calendarViewKey}
            stageRef={viewStageRef}
            timeFormat={timeFormat}
            timezone={timezone}
            view={view}
            weekStartDay={weekStartDay}
            workingDays={workingDays}
          />
        </CalendarDndProvider>
      </div>

      <EventCalendarContextMenu
        currentDate={currentDate}
        onCreateEvent={handleEventCreate}
        onDeleteEvent={handleEventDelete}
        onEditEvent={onEventEdit}
        onOpenChange={(open) => {
          setMenuOpen(open);
          if (!open) {
            onSetPreview?.(null);
          }
        }}
        open={menuOpen}
        position={menuPosition}
        target={menuTarget}
        timezone={resolvedTimezone}
      />
    </ErrorBoundary>
  );
}
