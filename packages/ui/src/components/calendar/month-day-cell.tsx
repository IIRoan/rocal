"use client";

import React from "react";
import {
  getWorkingDayShade,
  isCancelledCalendarEvent,
  isTodayInTimezone,
  wallClockToUtc,
  type TimeFormat,
} from "@workspace/calendar-core";
import { cn } from "../../lib/utils";
import { format, isSameMonth } from "date-fns";

import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { DraggableEvent } from "./draggable-event";
import { DroppableCell } from "./droppable-cell";
import { EventItem } from "./event-item";
import { formatTimeWithOptionalMinutesTZ } from "./event-time-label";
import { getEventSegmentForCalendarDay, sortEvents } from "./utils";
import { EventHeight, DefaultStartHour } from "./constants";
import { CalendarEvent } from "./types";

type DayBuckets = {
  dayEvents: CalendarEvent[];
  spanningEvents: CalendarEvent[];
  allEvents: CalendarEvent[];
  sortedAllDay: CalendarEvent[];
};

const DAY_SHADE_CLASS = {
  workday: "bg-[var(--calendar-workday)]",
  weekend: "bg-[var(--calendar-weekend)]",
  none: "",
} as const;

type MonthDayCellProps = {
  day: Date;
  currentDate: Date;
  buckets: DayBuckets;
  weekIndex: number;
  dayIndex: number;
  isMounted: boolean;
  compactView: boolean;
  timeFormat: TimeFormat;
  workingDays: number[];
  timezone: string | undefined;
  resolvedTimezone: string;
  contentRef: React.RefObject<HTMLDivElement | null>;
  getVisibleEventCount: (total: number) => number;
  onEventSelect: (event: CalendarEvent) => void;
  onEventCreate: (startTime: Date) => void;
  onEventEdit?: (event: CalendarEvent) => void;
  onEventDelete?: (event: CalendarEvent) => void;
  onEventView?: (event: CalendarEvent) => void;
};

export function MonthDayCell({
  day,
  currentDate,
  buckets,
  weekIndex,
  dayIndex,
  isMounted,
  compactView,
  timeFormat,
  workingDays,
  timezone,
  resolvedTimezone,
  contentRef,
  getVisibleEventCount,
  onEventSelect,
  onEventCreate,
  onEventEdit,
  onEventDelete,
  onEventView,
}: MonthDayCellProps) {
  const { dayEvents, spanningEvents, allEvents, sortedAllDay } = buckets;
  const isCurrentMonth = isSameMonth(day, currentDate);
  const shade = getWorkingDayShade(day.getDay(), workingDays);
  const cellId = `month-cell-${day.toISOString()}`;
  const allDayEvents = [...spanningEvents, ...dayEvents];
  const isReferenceCell = weekIndex === 0 && dayIndex === 0;
  const visibleCount = isMounted
    ? getVisibleEventCount(allDayEvents.length)
    : undefined;
  const hasMore =
    visibleCount !== undefined && allDayEvents.length > visibleCount;
  const remainingCount = hasMore ? allDayEvents.length - visibleCount : 0;

  function handleEventClick(event: CalendarEvent, e: React.MouseEvent) {
    e.stopPropagation();
    onEventSelect(event);
  }

  return (
    <div
      className={`group border-border/70 data-outside-cell:bg-muted/25 data-outside-cell:text-muted-foreground/70 border-r border-b last:border-r-0 transition-[background-color,box-shadow] duration-200 hover:bg-accent/5 hover:shadow-sm ${
        isCurrentMonth ? DAY_SHADE_CLASS[shade ?? "none"] : ""
      }`}
      data-today={isTodayInTimezone(day, resolvedTimezone) || undefined}
      data-outside-cell={!isCurrentMonth || undefined}
    >
      <DroppableCell
        id={cellId}
        date={day}
        onClick={() => {
          onEventCreate(
            wallClockToUtc(day, DefaultStartHour, 0, resolvedTimezone),
          );
        }}
      >
        <div className="group-data-today:bg-[var(--calendar-accent-bg)] group-data-today:text-[var(--calendar-accent)] group-data-today:font-semibold mt-1 inline-flex size-6 items-center justify-center rounded-full text-sm transition-[background-color,scale] duration-200 hover:scale-110 hover:bg-accent/10 group-data-today:animate-pulse">
          {format(day, "d")}
        </div>
        <div
          ref={isReferenceCell ? contentRef : null}
          className={`${
            compactView
              ? "min-h-[calc((var(--event-height)+var(--event-gap))*3)] sm:min-h-[calc((var(--event-height)+var(--event-gap))*4)] lg:min-h-[calc((var(--event-height)+var(--event-gap))*5)]"
              : "min-h-[calc((var(--event-height)+var(--event-gap))*2)] sm:min-h-[calc((var(--event-height)+var(--event-gap))*3)] lg:min-h-[calc((var(--event-height)+var(--event-gap))*4)]"
          }`}
        >
          {sortedAllDay.map((event, index) => {
            const { isFirstDay, isLastDay } = getEventSegmentForCalendarDay(
              event,
              day,
              resolvedTimezone,
            );
            const isHidden = isMounted && visibleCount && index >= visibleCount;

            if (!visibleCount) return null;

            if (!isFirstDay) {
              return (
                <div
                  key={`spanning-${event.id}-${day.toISOString().slice(0, 10)}`}
                  className="aria-hidden:hidden"
                  aria-hidden={isHidden ? "true" : undefined}
                >
                  <EventItem
                    onClick={(e) => handleEventClick(event, e)}
                    event={event}
                    view="month"
                    isFirstDay={isFirstDay}
                    isLastDay={isLastDay}
                    timeFormat={timeFormat}
                    timezone={timezone}
                    onEdit={onEventEdit}
                    onDelete={onEventDelete}
                    onView={onEventView}
                  >
                    <div className="invisible" aria-hidden={true}>
                      {!event.allDay && (
                        <span>
                          {formatTimeWithOptionalMinutesTZ(
                            new Date(event.start),
                            timeFormat,
                            timezone,
                          )}{" "}
                        </span>
                      )}
                      <span
                        className={cn(
                          isCancelledCalendarEvent(event) &&
                            "line-through opacity-70",
                        )}
                      >
                        {event.title}
                      </span>
                    </div>
                  </EventItem>
                </div>
              );
            }

            return (
              <div
                key={event.id}
                className="aria-hidden:hidden"
                aria-hidden={isHidden ? "true" : undefined}
              >
                <DraggableEvent
                  event={event}
                  view="month"
                  onClick={(e) => handleEventClick(event, e)}
                  isFirstDay={isFirstDay}
                  isLastDay={isLastDay}
                  timeFormat={timeFormat}
                  timezone={timezone}
                  onEdit={onEventEdit}
                  onDelete={onEventDelete}
                  onView={onEventView}
                />
              </div>
            );
          })}

          {hasMore && (
            <Popover modal>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="focus-visible:border-ring focus-visible:ring-ring/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:scale-[1.02] mt-[var(--event-gap)] flex h-[var(--event-height)] w-full items-center overflow-hidden px-1 text-left text-[10px] transition-[color,background-color,scale] duration-200 outline-none select-none focus-visible:ring-[3px] sm:px-2 sm:text-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span>
                    + {remainingCount}{" "}
                    <span className="max-sm:sr-only">more</span>
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="center"
                className="max-w-52 p-3 animate-scale-in"
                style={
                  {
                    "--event-height": `${EventHeight}px`,
                  } as React.CSSProperties
                }
              >
                <div className="space-y-2">
                  <div className="text-sm font-medium">{format(day, "EEE d")}</div>
                  <div className="space-y-1">
                    {sortEvents(allEvents, resolvedTimezone).map((event) => {
                      const { isFirstDay, isLastDay } = getEventSegmentForCalendarDay(
                        event,
                        day,
                        resolvedTimezone,
                      );

                      return (
                        <EventItem
                          key={event.id}
                          onClick={(e) => handleEventClick(event, e)}
                          event={event}
                          view="month"
                          isFirstDay={isFirstDay}
                          isLastDay={isLastDay}
                          timeFormat={timeFormat}
                          timezone={timezone}
                          onEdit={onEventEdit}
                          onDelete={onEventDelete}
                          onView={onEventView}
                        />
                      );
                    })}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </DroppableCell>
    </div>
  );
}
