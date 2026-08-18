"use client";

import { createLogger } from "@workspace/logger";
import {
  getZonedDateParts,
  isTodayInTimezone,
  navigateCalendarDate,
  resolveTimezone,
  wallClockToUtc,
} from "@workspace/calendar-core";
import { addDays } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useIsMobile } from "../../hooks/use-mobile";
import { useDropdownShortcuts } from "../../hooks/use-keyboard-shortcuts";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { ErrorBoundary } from "../ui/error-boundary";
import { useCalendarContext } from "./calendar-context";
import { CalendarDndProvider } from "./calendar-dnd-context";
import { CalendarSkeleton } from "./calendar-skeleton";
import {
  AgendaDaysToShow,
  EventGap,
  EventHeight,
  WeekCellsHeight,
} from "./constants";
import { persistDraggedCalendarEvent } from "./event-calendar-mutations";
import { MobileEventCalendarToolbar } from "./mobile-event-calendar-toolbar";
import { MobileEventCalendarViews } from "./mobile-event-calendar-views";
import type { EventNotification } from "./notification-manager";
import type { CalendarEvent, CalendarView, User } from "./types";
import { addMinutesToDate } from "./utils";

const log = createLogger("mobile-calendar");

const EMPTY_CALENDAR_EVENTS: CalendarEvent[] = [];
const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];

function reloadWindow() {
  window.location.reload();
}

export interface MobileEventCalendarProps {
  className?: string;
  initialView?: CalendarView;
  currentDateOverride?: Date;
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
    },
  ) => void;
  onSidebarToggle?: () => void;
  onViewChange?: (view: CalendarView) => void;
  user?: User;
}

export function MobileEventCalendar({
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
  themeSettings,
  onEventEdit,
  onViewChange,
  currentDateOverride,
}: MobileEventCalendarProps) {
  const { currentDate: contextCurrentDate, currentView, setCurrentDate, setCurrentView } =
    useCalendarContext();
  const currentDate = currentDateOverride || contextCurrentDate;
  const view = currentView;
  const isMobile = useIsMobile();
  const resolvedTimezone = resolveTimezone(timezone);
  const updateEvent = onUpdateEvent || (async () => {});

  const setView = (nextView: CalendarView) => {
    setCurrentView(nextView);
    onViewChange?.(nextView);
  };

  useDropdownShortcuts([
    { key: "m", action: () => setView("month") },
    { key: "w", action: () => setView("week") },
    { key: "d", action: () => setView("day") },
    { key: "a", action: () => setView("agenda") },
    { key: "t", action: () => setView("3day") },
  ]);

  const navigateTo = (newDate: Date) => {
    setCurrentDate(newDate);
  };

  const handlePrevious = () => {
    navigateTo(
      view === "agenda"
        ? addDays(currentDate, -AgendaDaysToShow)
        : navigateCalendarDate(currentDate, view, -1),
    );
  };

  const handleNext = () => {
    navigateTo(
      view === "agenda"
        ? addDays(currentDate, AgendaDaysToShow)
        : navigateCalendarDate(currentDate, view, 1),
    );
  };

  const handleEventSelect = (event: CalendarEvent) => {
    onEventEdit?.(event);
  };

  const handleEventCreate = (startTime: Date) => {
    startTime.setSeconds(0);
    startTime.setMilliseconds(0);

    onEventEdit?.({
      id: undefined as unknown as string,
      title: "",
      start: startTime,
      end: addMinutesToDate(startTime, defaultEventDuration),
      allDay: false,
      calendarId: defaultCalendarId || "",
      userId: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  };

  const handleToday = () => {
    navigateTo(new Date());
  };

  const handleNewEventPress = () => {
    if (isTodayInTimezone(currentDate, resolvedTimezone)) {
      const { hours, minutes } = getZonedDateParts(new Date(), resolvedTimezone);
      handleEventCreate(
        wallClockToUtc(currentDate, hours, minutes, resolvedTimezone),
      );
      return;
    }

    handleEventCreate(wallClockToUtc(currentDate, 9, 0, resolvedTimezone));
  };

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
        className="flex has-data-[slot=month-view]:flex-1 flex-col rounded-lg"
        style={
          {
            "--event-height": `${compactView ? Math.round(EventHeight * 0.75) : EventHeight}px`,
            "--event-gap": `${compactView ? Math.round(EventGap * 0.5) : EventGap}px`,
            "--week-cells-height": `${
              compactView
                ? Math.round(WeekCellsHeight * 0.85)
                : isMobile
                  ? Math.round(WeekCellsHeight * 0.9)
                  : WeekCellsHeight
            }px`,
          } as React.CSSProperties
        }
      >
        <CalendarDndProvider
          onEventUpdate={(updatedEvent) =>
            persistDraggedCalendarEvent({
              timezone: resolvedTimezone,
              updateEvent,
              updatedEvent,
            })
          }
          timezone={timezone}
        >
          <MobileEventCalendarToolbar
            currentDate={currentDate}
            eventsLoading={eventsLoading}
            loading={loading}
            onNext={handleNext}
            onNewEvent={handleNewEventPress}
            onPrevious={handlePrevious}
            onToday={handleToday}
            onViewChange={setView}
            themeSettings={themeSettings}
            timezone={resolvedTimezone}
            view={view}
            weekStartDay={weekStartDay}
          />
          <MobileEventCalendarViews
            compactView={compactView}
            currentDate={currentDate}
            events={events}
            isMobile={isMobile}
            onEventCreate={handleEventCreate}
            onEventSelect={handleEventSelect}
            showWeekNumbers={showWeekNumbers}
            timeFormat={timeFormat}
            timezone={timezone}
            view={view}
            weekStartDay={weekStartDay}
            workingDays={workingDays}
          />
        </CalendarDndProvider>
      </div>
    </ErrorBoundary>
  );
}
