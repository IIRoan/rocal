"use client";

import { useMemo } from "react";
import { CalendarBlankIcon } from "@phosphor-icons/react";
import { addDays, format, isToday } from "date-fns";

import { AgendaDaysToShow } from "./constants";
import { CalendarEvent } from "./types";
import { EventItem } from "./event-item";
import { getAgendaEventsForDay } from "./utils";

interface AgendaViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventSelect: (event: CalendarEvent) => void;
  onEventCreate?: (startTime: Date) => void;
  timeFormat?: "12h" | "24h";
  timezone?: string;
  // Context menu actions
  onEventEdit?: (event: CalendarEvent) => void;
  onEventDelete?: (event: CalendarEvent) => void;
  onEventView?: (event: CalendarEvent) => void;
}

export function AgendaView({
  currentDate,
  events,
  onEventSelect,
  timeFormat = "12h",
  timezone,
  onEventEdit,
  onEventDelete,
  onEventView,
}: AgendaViewProps) {
  // Show events for the next days based on constant
  const days = useMemo(() => {
    return Array.from({ length: AgendaDaysToShow }, (_, i) =>
      addDays(new Date(currentDate), i),
    );
  }, [currentDate]);

  const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    onEventSelect(event);
  };

  // Check if there are any days with events
  const hasEvents = days.some(
    (day) => getAgendaEventsForDay(events, day).length > 0,
  );

  return (
    <div className="absolute inset-0 border-border/70 border-t ps-4 overflow-y-auto bg-background animate-fade-in">
      {!hasEvents ? (
        <div className="flex min-h-[70svh] flex-col items-center justify-center py-16 text-center">
          <span className="text-muted-foreground/50 mb-2">
            <CalendarBlankIcon size={32} />
          </span>
          <h3 className="text-lg font-medium">No events found</h3>
          <p className="text-muted-foreground">
            There are no events scheduled for this time period.
          </p>
        </div>
      ) : (
        days.map((day) => {
          const dayEvents = getAgendaEventsForDay(events, day);

          if (dayEvents.length === 0) return null;

          return (
            <div
              key={day.toString()}
              className="border-border/70 relative my-12 border-t"
            >
              <span
                className="bg-background absolute -top-3 left-0 flex h-6 items-center pe-4 text-[10px] uppercase data-today:font-medium sm:pe-4 sm:text-xs"
                data-today={isToday(day) || undefined}
              >
                {format(day, "d MMM, EEEE")}
              </span>
              <div className="mt-6 space-y-2">
                {dayEvents.map((event) => (
                  <EventItem
                    key={event.id}
                    event={event}
                    view="agenda"
                    onClick={(e) => handleEventClick(event, e)}
                    timeFormat={timeFormat}
                    timezone={timezone}
                    onEdit={onEventEdit}
                    onDelete={onEventDelete}
                    onView={onEventView}
                  />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
