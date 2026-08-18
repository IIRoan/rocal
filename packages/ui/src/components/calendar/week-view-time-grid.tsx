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
import { StartHour } from "./constants";
import type { PositionedTimelineEvent } from "./timeline-layout";
import { WEEK_HOUR_VALUES, formatWeekHourLabel } from "./week-view-hours";
import type { WeekEventHandlers } from "./week-view-types";

export function WeekViewTimeGrid({
  currentTimePosition,
  currentTimeVisible,
  days,
  handlers,
  processedDayEvents,
  scrollRef,
  timeFormat,
  timezone,
}: {
  currentTimePosition: number;
  currentTimeVisible: boolean;
  days: Date[];
  handlers: WeekEventHandlers;
  processedDayEvents: PositionedTimelineEvent[][];
  scrollRef: RefObject<HTMLDivElement | null>;
  timeFormat: "12h" | "24h";
  timezone: string;
}) {
  return (
    <div
      ref={scrollRef}
      className="grid flex-1 grid-cols-[3rem_repeat(7,minmax(0,1fr))] overflow-y-auto min-h-0"
      style={{ scrollBehavior: "auto" }}
    >
      <div className="grid auto-cols-fr">
        {WEEK_HOUR_VALUES.map((hourValue) => (
          <div
            key={hourValue}
            className="relative min-h-[var(--week-cells-height)]"
          >
            {hourValue > StartHour && (
              <span className="bg-background text-muted-foreground/70 absolute -top-3 left-0 flex h-6 w-full items-center justify-end pe-1 text-[9px] sm:text-[10px]">
                {formatWeekHourLabel(hourValue, timeFormat)}
              </span>
            )}
          </div>
        ))}
      </div>

      {days.map((day, dayIndex) => (
        <div
          key={formatCalendarDayKey(day)}
          className={`border-border/70 relative border-r last:border-r-0 grid auto-cols-fr ${
            isTodayInTimezone(day, timezone)
              ? "bg-[var(--calendar-accent-bg)]/20"
              : ""
          }`}
          data-today={isTodayInTimezone(day, timezone) || undefined}
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
              <div className="h-full w-full px-[1px]">
                {positionedEvent.event && (
                  <DraggableEvent
                    event={positionedEvent.event}
                    view="week"
                    onClick={(mouseEvent) =>
                      handlers.onEventClick(positionedEvent.event, mouseEvent)
                    }
                    showTime
                    height={positionedEvent.height}
                    timeFormat={timeFormat}
                    timezone={timezone}
                    onEdit={handlers.onEventEdit}
                    onDelete={handlers.onEventDelete}
                    onView={handlers.onEventView}
                  />
                )}
              </div>
            </div>
          ))}

          {currentTimeVisible && isTodayInTimezone(day, timezone) && (
            <CurrentTimeIndicator
              position={currentTimePosition}
              variant="calendar-accent"
            />
          )}
          {WEEK_HOUR_VALUES.map((hourValue) => (
            <div
              key={hourValue}
              className="border-border/70 relative min-h-[var(--week-cells-height)] border-b last:border-b-0"
            >
              {[0, 1, 2, 3].map((quarter) => (
                <DroppableCell
                  key={`${hourValue}-${quarter}`}
                  id={`week-cell-d${formatCalendarDayKey(day)}-h${hourValue}-q${quarter}`}
                  date={day}
                  time={hourValue + quarter * 0.25}
                  className={cn(
                    "absolute h-[calc(var(--week-cells-height)/4)] w-full",
                    quarter === 0 && "top-0",
                    quarter === 1 && "top-[calc(var(--week-cells-height)/4)]",
                    quarter === 2 &&
                      "top-[calc(var(--week-cells-height)/4*2)]",
                    quarter === 3 &&
                      "top-[calc(var(--week-cells-height)/4*3)]",
                  )}
                  onClick={() => {
                    handlers.onEventCreate(
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
