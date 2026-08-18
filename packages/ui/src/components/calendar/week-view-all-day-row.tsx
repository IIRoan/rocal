import {
  formatCalendarDayKey,
  isCancelledCalendarEvent,
} from "@workspace/calendar-core";

import { cn } from "../../lib/utils";
import { EventItem } from "./event-item";
import { getEventSegmentForCalendarDay } from "./utils";
import type { CalendarEvent } from "./types";
import type { WeekEventHandlers } from "./week-view-types";

export function WeekViewAllDayRow({
  allDayEventsByDay,
  days,
  handlers,
  timezone,
}: {
  allDayEventsByDay: CalendarEvent[][];
  days: Date[];
  handlers: WeekEventHandlers;
  timezone: string;
}) {
  return (
    <div className="grid w-full grid-cols-[3rem_repeat(7,minmax(0,1fr))] items-stretch border-b border-border/40 relative z-30 shrink-0">
      <div className="h-full flex flex-col bg-background">
        <div className="flex flex-1 flex-col items-center justify-center min-h-[24px]">
          <span className="text-[9px] text-muted-foreground/40 leading-none">
            all-day
          </span>
        </div>
      </div>
      {days.map((day, dayIndex) => {
        const dayEvents = allDayEventsByDay[dayIndex] ?? [];
        return (
          <div
            key={`all-day-${formatCalendarDayKey(day)}`}
            className="shadow-sm h-full flex flex-col bg-background"
          >
            <div
              className={cn(
                "flex flex-1 flex-col justify-start p-0.5 gap-0.5",
                dayEvents.length === 0 && "min-h-[24px]",
              )}
            >
              {dayEvents.map((event) => {
                const { isFirstDay, isLastDay } = getEventSegmentForCalendarDay(
                  event,
                  day,
                  timezone,
                );

                return (
                  <div key={`allday-${event.id}`} className="w-full">
                    <EventItem
                      onClick={(mouseEvent) =>
                        handlers.onEventClick(event, mouseEvent)
                      }
                      event={event}
                      view="month"
                      isFirstDay={isFirstDay}
                      isLastDay={isLastDay}
                      className="text-[10px] min-h-[20px] h-[22px] items-center"
                      timezone={timezone}
                      onEdit={handlers.onEventEdit}
                      onDelete={handlers.onEventDelete}
                      onView={handlers.onEventView}
                    >
                      <div
                        className={cn(
                          "truncate text-[10px] leading-tight",
                          !isFirstDay && "invisible",
                        )}
                        aria-hidden={!isFirstDay}
                      >
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
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
