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
  isMobile?: boolean;
}

export function SidebarCalendar({
  events = [],
  onDisplayMonthChange,
  className,
  isMobile = false,
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
    const monthStart = startOfWeek(startOfMonth(calendarMonth), {
      weekStartsOn: 1,
    });
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
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between mb-4 px-1">
        <button
          onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}
          className="p-2 rounded-full hover:bg-accent transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft size={20} className="text-muted-foreground" />
        </button>
        <button
          onClick={() => setCalendarMonth(currentDate)}
          className="text-[15px] font-bold tracking-tight"
        >
          {format(calendarMonth, "MMMM yyyy")}
        </button>
        <button
          onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}
          className="p-2 rounded-full hover:bg-accent transition-colors"
          aria-label="Next month"
        >
          <ChevronRight size={20} className="text-muted-foreground" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2 px-1">
        {weekdayLabels.map((label, index) => (
          <div
            key={`${label}-${index}`}
            className="aspect-square flex items-center justify-center text-[11px] font-black text-muted-foreground/50 uppercase"
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
                "relative flex items-center justify-center transition-transform",
                isMobile 
                  ? "aspect-square rounded-[12px] text-[14px] active:scale-90 flex-col gap-1" 
                  : "h-8 w-8 mx-auto rounded-lg text-[13px] font-medium",
                !isCurrentMonth && "text-muted-foreground/30",
                isCurrentMonth && !isSelected && !isCurrentDay && "text-foreground hover:bg-accent/60",
                isCurrentDay && !isSelected && "ring-2 ring-inset ring-foreground/20 text-foreground font-bold hover:bg-accent/60",
                isCurrentDay && isSelected && "ring-2 ring-inset ring-foreground/40",
              )}
            >
              {isSelected && (
                <div className={cn(
                  "absolute inset-0.5 rounded-md bg-primary shadow-sm",
                  isMobile && "inset-0 rounded-[12px]"
                )} />
              )}
              <span className="relative z-10 text-inherit data-[selected=true]:text-primary-foreground">
                <span className={cn(isSelected && "text-primary-foreground")}>
                  {format(day, "d")}
                </span>
              </span>
              {dayEvents.length > 0 && (
                <div className={cn(
                  "flex items-center justify-center z-10",
                  isMobile ? "gap-0.5 mt-[-2px]" : "absolute bottom-[6px] gap-[2px] w-full"
                )}>
                  {dayEvents.slice(0, 3).map((event, i) => (
                    <div
                      key={`${event.id || "event"}-${i}`}
                      className={cn(
                        "rounded-full",
                        isMobile ? "w-1 h-1" : "w-1 h-1"
                      )}
                      style={{
                        backgroundColor: isSelected ? 'white' : resolveEventColorValue(event.color),
                      }}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
