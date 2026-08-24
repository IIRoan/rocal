"use client";

import {
  formatCalendarDayKey,
  isTodayInTimezone,
  wallClockToUtc,
} from "@workspace/calendar-core";

import type { RefObject } from "react";
import { cn } from "../../lib/utils";
import { CurrentTimeIndicator } from "./current-time-indicator";
import { DraggableEvent } from "./draggable-event";
import { DroppableCell } from "./droppable-cell";
import type { PositionedTimelineEvent } from "./timeline-layout";
import { THREE_DAY_GRID_COLS } from "./three-day-view-utils";
import type { CalendarEvent } from "./types";
import { WEEK_HOUR_VALUES, formatWeekHourLabel } from "./week-view-hours";

export function ThreeDayViewTimeGrid({
  currentTimePosition,
  currentTimeVisible,
  days,
  onEventClick,
  onEventCreate,
  onEventDelete,
  onEventEdit,
  onEventView,
  processedDayEvents,
  scrollRef,
  timeFormat,
  timezone,
}: {
  currentTimePosition: number;
  currentTimeVisible: boolean;
  days: Date[];
  onEventClick: (
    event: CalendarEvent,
    mouseEvent: React.MouseEvent,
    dayIndex: number,
  ) => void;
  onEventCreate: (startTime: Date) => void;
  onEventDelete?: (event: CalendarEvent) => void;
  onEventEdit?: (event: CalendarEvent) => void;
  onEventView?: (event: CalendarEvent) => void;
  processedDayEvents: PositionedTimelineEvent[][];
  scrollRef: RefObject<HTMLDivElement | null>;
  timeFormat: "12h" | "24h";
  timezone: string;
}) {
  return (
    <div
      ref={scrollRef}
      className={cn("grid min-h-0 flex-1 overflow-y-auto", THREE_DAY_GRID_COLS)}
      style={{ scrollBehavior: "smooth", scrollbarGutter: "stable" }}
    >
      <div className="border-r border-border/50 bg-background">
        {WEEK_HOUR_VALUES.map((hourValue) => (
          <div
            key={hourValue}
            className="relative min-h-[var(--week-cells-height)]"
          >
            <span
              className={cn(
                "absolute left-0 flex h-6 w-full items-center justify-end bg-background pe-1 text-[9px] text-muted-foreground/70 sm:text-[10px]",
                hourValue === 0 ? "top-0" : "-top-3",
              )}
            >
              {formatWeekHourLabel(hourValue, timeFormat)}
            </span>
          </div>
        ))}
      </div>

      {days.map((day, dayIndex) => (
        <div
          key={formatCalendarDayKey(day)}
          className={cn(
            "relative min-w-0 border-r border-border/50 last:border-r-0",
            isTodayInTimezone(day, timezone) && "bg-primary/5",
          )}
        >
          {(processedDayEvents[dayIndex] ?? []).map((positionedEvent) => (
            <div
              key={
                positionedEvent.event?.id ??
                `${formatCalendarDayKey(day)}-${positionedEvent.top}-${positionedEvent.left}-${positionedEvent.zIndex}`
              }
              className="absolute z-10 h-full"
              style={{
                top: `${positionedEvent.top}px`,
                height: `${positionedEvent.height}px`,
                left: `${positionedEvent.left * 100}%`,
                width: `${positionedEvent.width * 100}%`,
                zIndex: positionedEvent.zIndex,
              }}
              onClick={(mouseEvent) => mouseEvent.stopPropagation()}
            >
              <div className="h-full w-full overflow-hidden px-0.5">
                {positionedEvent.event && (
                  <DraggableEvent
                    event={positionedEvent.event}
                    view="week"
                    onClick={(mouseEvent) =>
                      onEventClick(positionedEvent.event, mouseEvent, dayIndex)
                    }
                    showTime
                    height={positionedEvent.height}
                    timeFormat={timeFormat}
                    timezone={timezone}
                    onEdit={onEventEdit}
                    onDelete={onEventDelete}
                    onView={onEventView}
                  />
                )}
              </div>
            </div>
          ))}

          {currentTimeVisible && isTodayInTimezone(day, timezone) && (
            <CurrentTimeIndicator position={currentTimePosition} />
          )}

          {WEEK_HOUR_VALUES.map((hourValue) => (
            <div
              key={hourValue}
              className="relative min-h-[var(--week-cells-height)] border-b border-border/50 last:border-b-0"
            >
              {[0, 1, 2, 3].map((quarter) => (
                <DroppableCell
                  key={`${hourValue}-${quarter}`}
                  id={`3day-cell-${formatCalendarDayKey(day)}-${hourValue}-${quarter}`}
                  date={day}
                  time={hourValue + quarter * 0.25}
                  className={cn(
                    "absolute w-full",
                    quarter === 0 && "top-0",
                    quarter === 1 && "top-1/4",
                    quarter === 2 && "top-1/2",
                    quarter === 3 && "top-3/4",
                  )}
                  style={{ height: "calc(var(--week-cells-height) / 4)" }}
                  onClick={() => {
                    onEventCreate(
                      wallClockToUtc(day, hourValue, quarter * 15, timezone),
                    );
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
