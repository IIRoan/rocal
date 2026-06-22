"use client";

import { useMemo } from "react";
import { CalendarBlankIcon } from "@phosphor-icons/react";
import { addDays, format } from "date-fns";
import { isTodayInTimezone, resolveTimezone } from "@workspace/calendar-core";

import { AgendaDaysToShow } from "./constants";
import { CalendarEvent } from "./types";
import { EventItem } from "./event-item";
import { getAgendaEventsForDay } from "./utils";
import { cn } from "../../lib/utils";

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
  const resolvedTimezone = resolveTimezone(timezone);
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
    (day) => getAgendaEventsForDay(events, day, resolvedTimezone).length > 0,
  );

  return (
    <div className="absolute inset-0 border-border/70 border-t overflow-y-auto bg-background animate-fade-in">
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
        <div className="px-3 sm:px-6 py-4 space-y-6">
          {days.map((day) => {
            const dayEvents = getAgendaEventsForDay(
              events,
              day,
              resolvedTimezone,
            );

            if (dayEvents.length === 0) return null;

            const today = isTodayInTimezone(day, resolvedTimezone);

            return (
              <section key={day.toString()} className="flex flex-col gap-1.5">
                <header
                  className="sticky top-0 z-10 -mx-3 sm:-mx-6 flex items-baseline gap-3 bg-background/95 px-3 sm:px-6 pt-1 pb-2 backdrop-blur-sm"
                  data-today={today || undefined}
                >
                  <div className="flex items-baseline gap-2">
                    <span
                      className={cn(
                        "text-2xl font-light tabular-nums leading-none tracking-tight",
                        today ? "text-primary" : "text-foreground",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] font-semibold uppercase tracking-wider",
                        today ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {format(day, "EEE")}
                    </span>
                  </div>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
                    {format(day, "MMMM")}
                  </span>
                  {today && (
                    <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                      Today
                    </span>
                  )}
                </header>
                <div className="flex flex-col">
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
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
