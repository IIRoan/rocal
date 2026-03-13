"use client";

import { useEffect, useMemo, useState } from "react";
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  addMonths,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCalendarContext } from "../calendar/calendar-context";
import { CalendarEvent } from "../calendar/types";
import { getAllEventsForDay, resolveEventColorValue } from "../calendar/utils";
import { cn } from "../../lib/utils";

interface SidebarCalendarProps {
  events?: CalendarEvent[];
  onDisplayMonthChange?: (dateRange: { start: Date; end: Date }) => void;
  className?: string;
}

export function SidebarCalendar({
  events = [],
  onDisplayMonthChange,
  className,
}: SidebarCalendarProps) {
  const { currentDate, setCurrentDate } = useCalendarContext();
  const [calendarMonth, setCalendarMonth] = useState<Date>(currentDate);

  useEffect(() => {
    if (currentDate && !isNaN(currentDate.getTime())) {
      setCalendarMonth(currentDate);
    } else {
      const now = new Date();
      setCalendarMonth(now);
      setCurrentDate(now);
    }
  }, [currentDate, setCurrentDate]);

  useEffect(() => {
    const monthStart = startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 1 });
    const monthEnd = endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 1 });
    onDisplayMonthChange?.({ start: monthStart, end: monthEnd });
  }, [calendarMonth, onDisplayMonthChange]);

  const days = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = endOfMonth(calendarMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [calendarMonth]);

  const weekdayLabels = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <div className={cn("w-full max-w-[18rem]", className)}>
      <div className="flex items-center justify-between mb-2 px-1">
        <button
          onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}
          className="p-1.5 rounded-md hover:bg-accent transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft size={16} className="text-muted-foreground" />
        </button>
        <button
          onClick={() => setCalendarMonth(currentDate)}
          className="text-sm font-semibold"
        >
          {format(calendarMonth, "MMMM yyyy")}
        </button>
        <button
          onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}
          className="p-1.5 rounded-md hover:bg-accent transition-colors"
          aria-label="Next month"
        >
          <ChevronRight size={16} className="text-muted-foreground" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1 px-1">
        {weekdayLabels.map((label, index) => (
          <div
            key={`${label}-${index}`}
            className="h-8 flex items-center justify-center text-xs font-medium text-muted-foreground/80"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 px-1">
        {days.map((day) => {
          const isSelected = isSameDay(day, currentDate);
          const isCurrentMonth = isSameMonth(day, calendarMonth);
          const isCurrentDay = isToday(day);
          const dayEvents = getAllEventsForDay(events, day);

          return (
            <button
              key={day.toISOString()}
              onClick={() => setCurrentDate(day)}
              className={cn(
                "relative size-8 rounded-full text-sm transition-colors",
                "flex items-center justify-center",
                !isCurrentMonth && "text-muted-foreground/35",
                isCurrentMonth && !isSelected && "hover:bg-accent text-foreground",
                isSelected && "text-primary font-semibold",
                isCurrentDay && !isSelected && "text-primary font-semibold",
              )}
            >
              {format(day, "d")}
              {dayEvents.length > 0 && (
                <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 flex items-center gap-0.5">
                  {dayEvents.slice(0, 3).map((event, i) => (
                    <span
                      key={`${event.id || "event"}-${i}`}
                      className="w-1 h-1 rounded-full"
                      style={{
                        backgroundColor: resolveEventColorValue(event.color),
                      }}
                    />
                  ))}
                </span>
              )}
              {isSelected && (
                <span className="absolute -bottom-0.5 left-1/2 h-0.5 w-3 -translate-x-1/2 rounded bg-primary/75" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
