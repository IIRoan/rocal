"use client";

import React, { useMemo, useEffect, useRef, useState } from "react";
import {
  formatClockTimeRange,
  formatInUserTimezone,
  getWeekCalendarDays,
  getZonedDateParts,
  isCancelledCalendarEvent,
  isTodayInTimezone,
  resolveTimezone,
  wallClockToUtc,
  type TimeFormat,
} from "@workspace/calendar-core";
import {
  addHours,
  areIntervalsOverlapping,
  eachHourOfInterval,
  format,
  getHours,
  startOfDay,
} from "date-fns";

import { DraggableEvent } from "./draggable-event";
import { DroppableCell } from "./droppable-cell";
import { EventDots } from "./event-dots";
import { getTimedTimelineEventsForDay } from "./utils";
import { CalendarEvent } from "./types";
import { useCurrentTimeIndicator } from "../../hooks/use-current-time-indicator";
import { cn } from "../../lib/utils";
import { Drawer, DrawerContent, DrawerShell, DrawerTitle } from "../ui/drawer";
import { resolveInlineColorValue } from "./utils";
import { CurrentTimeIndicator } from "./current-time-indicator";
import { layoutTimelineEvents } from "./timeline-layout";
import { formatWeekHourLabel } from "./week-view-hours";

const MobileStartHour = 0;
const MobileEndHour = 23;
const MobileCellHeight = 50; // Smaller cells for week view to fit more

interface MobileWeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventSelect: (event: CalendarEvent) => void;
  onEventCreate: (startTime: Date) => void;
  timeFormat: TimeFormat;
  weekStartDay?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  workingDays?: number[];
  timezone?: string;
  showMonthPicker?: boolean;
}

export function MobileWeekView({
  currentDate,
  events,
  onEventSelect,
  onEventCreate,
  timeFormat,
  weekStartDay = 1,
  workingDays = [1, 2, 3, 4, 5],
  timezone,
  showMonthPicker = true,
}: MobileWeekViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerEvents, setDrawerEvents] = useState<CalendarEvent[]>([]);
  const resolvedTimezone = resolveTimezone(timezone);

  const days = useMemo(() => {
    return getWeekCalendarDays(currentDate, weekStartDay, resolvedTimezone);
  }, [currentDate, resolvedTimezone, weekStartDay]);

  const hours = useMemo(() => {
    const dayStart = startOfDay(currentDate);
    return eachHourOfInterval({
      start: addHours(dayStart, MobileStartHour),
      end: addHours(dayStart, MobileEndHour),
    });
  }, [currentDate]);

  const processedDayEvents = useMemo(() => {
    return days.map((day) => {
      const dayEvents = getTimedTimelineEventsForDay(
        events,
        day,
        resolvedTimezone,
        { excludeMultiDay: true },
      );

      dayEvents.sort((a, b) => {
        const aStart = new Date(a.start);
        const bStart = new Date(b.start);
        return aStart.getTime() - bStart.getTime();
      });

      return layoutTimelineEvents(dayEvents, day, {
        cellHeight: MobileCellHeight,
        widthStrategy: "no-overflow",
        timezone: resolvedTimezone,
      }).map((positionedEvent) => ({
        ...positionedEvent,
        dayIndex: 0,
      }));
    });
  }, [days, events, resolvedTimezone]);

  const handleEventClick = (
    event: CalendarEvent,
    e: React.MouseEvent,
    dayIndex: number,
  ) => {
    e.stopPropagation();

    const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

    if (isMobile) {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);

      const allDayEvents = processedDayEvents[dayIndex] ?? [];
      const overlapping = allDayEvents
        .flatMap((pe) => {
          if (!pe.event) return [];
          const otherStart = new Date(pe.event.start);
          const otherEnd = new Date(pe.event.end);
          return areIntervalsOverlapping(
            { start: eventStart, end: eventEnd },
            { start: otherStart, end: otherEnd },
          )
            ? [pe.event]
            : [];
        })
        .sort(
          (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
        );

      if (overlapping.length > 1) {
        setDrawerEvents(overlapping);
        setDrawerOpen(true);
      } else {
        onEventSelect(event);
      }
    } else {
      onEventSelect(event);
    }
  };

  const { currentTimePosition, currentTimeVisible } = useCurrentTimeIndicator(
    currentDate,
    "week",
    timezone,
  );

  useEffect(() => {
    if (scrollContainerRef.current && !hasScrolledRef.current) {
      const now = new Date();
      const nowParts = getZonedDateParts(now, resolvedTimezone);

      let targetHour: number;

      if (isTodayInTimezone(currentDate, resolvedTimezone)) {
        targetHour = nowParts.hours + nowParts.minutes / 60;
      } else {
        targetHour = 9;
      }

      const scrollPosition = targetHour * MobileCellHeight - 100; // Account for sticky header
      scrollContainerRef.current.scrollTo({
        top: Math.max(0, scrollPosition),
        behavior: "smooth",
      });
      hasScrolledRef.current = true;
    }
  }, [currentDate, resolvedTimezone]);

  useEffect(() => {
    hasScrolledRef.current = false;
  }, [currentDate]);

  return (
    <div className="flex flex-col h-full min-h-full">
      <MobileWeekDayHeaders days={days} timezone={resolvedTimezone} />
      <div className="relative">
        <div className="flex">
          <div className="w-11 flex-shrink-0 border-r border-border/50 bg-background">
            {hours.map((hour, index) => (
              <div
                key={hour.toString()}
                className="relative"
                style={{ height: MobileCellHeight }}
              >
                {index > 0 && (
                  <span className="absolute top-0 right-1 -translate-y-1/2 bg-background px-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                    {formatWeekHourLabel(getHours(hour), timeFormat)}
                  </span>
                )}
              </div>
            ))}
          </div>

          {days.map((day, dayIndex) => (
            <div
              key={day.toString()}
              className={cn(
                "flex-1 min-w-0 relative border-r border-border/50 last:border-r-0",
                isTodayInTimezone(day, resolvedTimezone) && "bg-accent/5",
              )}
            >
              {(processedDayEvents[dayIndex] ?? []).map(
                (positionedEvent, index) => (
                  // repo-rules-allow wcag-keyboard-access: positioning wrapper that only stops click propagation; the inner event button is the keyboard target
                  <div
                    key={positionedEvent.event?.id || index}
                    className="absolute z-10 h-full"
                    style={{
                      top: `${positionedEvent.top}px`,
                      height: `${positionedEvent.height}px`,
                      left: `${positionedEvent.left * 100}%`,
                      width: `${positionedEvent.width * 100}%`,
                      zIndex: positionedEvent.zIndex,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="h-full w-full px-0.5">
                      {positionedEvent.event && (
                        <DraggableEvent
                          event={positionedEvent.event}
                          view="week"
                          onClick={(e) =>
                            handleEventClick(positionedEvent.event, e, dayIndex)
                          }
                          showTime
                          height={positionedEvent.height}
                          timeFormat={timeFormat}
                          timezone={timezone}
                        />
                      )}
                    </div>
                  </div>
                ),
              )}

              {currentTimeVisible && isTodayInTimezone(day, resolvedTimezone) && (
                <CurrentTimeIndicator position={currentTimePosition} />
              )}

              {hours.map((hour) => {
                const hourValue = getHours(hour);
                return (
                  <div
                    key={hour.toString()}
                    className="relative border-b border-border/50"
                    style={{ height: MobileCellHeight }}
                  >
                    {[0, 1, 2, 3].map((quarter) => {
                      const quarterHourTime = hourValue + quarter * 0.25;
                      return (
                        <DroppableCell
                          key={`${hour.toString()}-${quarter}`}
                          id={`mobile-week-cell-${day.toISOString()}-${quarterHourTime}`}
                          date={day}
                          time={quarterHourTime}
                          className={cn(
                            "absolute w-full",
                            quarter === 0 && "top-0",
                            quarter === 1 && "top-1/4",
                            quarter === 2 && "top-1/2",
                            quarter === 3 && "top-3/4",
                          )}
                          style={{ height: MobileCellHeight / 4 }}
                          onClick={() => {
                            onEventCreate(
                              wallClockToUtc(
                                day,
                                hourValue,
                                quarter * 15,
                                resolvedTimezone,
                              ),
                            );
                          }}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}

          <OverlappingEventsDrawer
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            events={drawerEvents}
            timezone={resolvedTimezone}
            timeFormat={timeFormat}
            onSelect={(event) => {
              onEventSelect(event);
              setDrawerOpen(false);
              setDrawerEvents([]);
            }}
          />
        </div>
      </div>
    </div>
  );
}

function MobileWeekDayHeaders({
  days,
  timezone,
}: {
  days: Date[];
  timezone: string;
}) {
  return (
    <div className="sticky top-0 z-20 flex border-b border-border/50 bg-background">
      <div className="w-11 flex-shrink-0 border-r border-border/50" />
      {days.map((day) => {
        const today = isTodayInTimezone(day, timezone);
        return (
          <div
            key={day.toString()}
            aria-current={today ? "date" : undefined}
            className={cn(
              "flex-1 min-w-0 border-r border-border/50 py-1.5 text-center last:border-r-0",
              today && "bg-accent/5",
            )}
          >
            {today && <span className="sr-only">Today, </span>}
            <span
              className={cn(
                "block text-[11px] font-medium uppercase leading-none tracking-wide",
                today ? "text-accent" : "text-muted-foreground",
              )}
            >
              {format(day, "EEE")}
            </span>
            <span
              className={cn(
                "mt-1 block text-sm font-semibold leading-none tabular-nums",
                today ? "text-accent" : "text-foreground",
              )}
            >
              {format(day, "d")}
            </span>
            <div
              className={cn(
                "mx-auto mt-1 h-[2px] w-5 rounded-full",
                today ? "bg-accent" : "bg-transparent",
              )}
            />
          </div>
        );
      })}
    </div>
  );
}

function OverlappingEventsDrawer({
  open,
  onOpenChange,
  events,
  timezone,
  timeFormat,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: CalendarEvent[];
  timezone: string;
  timeFormat: TimeFormat;
  onSelect: (event: CalendarEvent) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        responsive
        responsiveHeight="70dvh"
        className="overflow-hidden"
      >
        <DrawerTitle className="sr-only">Select event</DrawerTitle>
        <DrawerShell
          header={
            <div className="px-5 py-3 border-b border-border/40">
              <span className="text-base font-semibold">
                Select event
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">
                {events[0] &&
                  formatInUserTimezone(
                    new Date(events[0].start),
                    timezone,
                    "EEEE, MMMM d",
                  )}
              </p>
            </div>
          }
        >
          <div className="overflow-y-auto p-2 pb-6">
            {events.map((event) => {
              const eventStart = new Date(event.start);
              const eventEnd = new Date(event.end);
              return (
                <button
                  key={event.id}
                  type="button"
                  className="w-full text-left flex items-center gap-3 p-2 rounded-md hover:bg-hover/30 transition-colors cursor-pointer"
                  onClick={() => onSelect(event)}
                >
                  <div className="flex items-center justify-center size-6 shrink-0">
                    <div
                      className="size-3 rounded-full"
                      style={{
                        backgroundColor: resolveInlineColorValue(
                          event.color || "blue",
                        ),
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className={cn(
                        "text-sm font-medium truncate",
                        isCancelledCalendarEvent(event) &&
                          "line-through opacity-70",
                      )}
                    >
                      {event.title || "Untitled event"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {event.allDay
                        ? "All day"
                        : formatClockTimeRange(
                            eventStart,
                            eventEnd,
                            timezone,
                            timeFormat,
                          )}
                      {event.location && ` · ${event.location}`}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </DrawerShell>
      </DrawerContent>
    </Drawer>
  );
}
