"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";
import { useCalendarContext } from "./calendar-context";
import { getAllEventsForDay } from "./utils";
import { CalendarEvent } from "./types";

interface MobileMonthPickerProps {
  className?: string;
  onDateSelect?: (date: Date) => void;
  events?: CalendarEvent[];
}

export function MobileMonthPicker({
  className,
  onDateSelect,
  events = [],
}: MobileMonthPickerProps) {
  const { currentDate, setCurrentDate } = useCalendarContext();
  const [displayMonth, setDisplayMonth] = useState(currentDate);

  const days = useMemo(() => {
    const monthStart = startOfMonth(displayMonth);
    const monthEnd = endOfMonth(displayMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [displayMonth]);

  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    return eachDayOfInterval({
      start: weekStart,
      end: addMonths(weekStart, 0),
    }).slice(0, 7);
  }, []);

  const handlePreviousMonth = () => {
    setDisplayMonth(subMonths(displayMonth, 1));
  };

  const handleNextMonth = () => {
    setDisplayMonth(addMonths(displayMonth, 1));
  };

  const handleDateClick = (date: Date) => {
    setCurrentDate(date);
    onDateSelect?.(date);
  };

  return (
    <div
      className={cn(
        "bg-background/95 backdrop-blur-sm border-b border-border/50 px-3 py-2",
        className,
      )}
    >
      {/* Compact month navigation header */}
      <div className="flex items-center justify-between mb-1.5">
        <button
          onClick={handlePreviousMonth}
          className="p-1.5 rounded-md hover:bg-accent active:bg-accent/80 transition-colors touch-manipulation"
        >
          <ChevronLeft size={16} className="text-muted-foreground" />
        </button>
        <button
          onClick={() => setDisplayMonth(currentDate)}
          className="text-sm font-semibold"
        >
          {format(displayMonth, "MMMM yyyy")}
        </button>
        <button
          onClick={handleNextMonth}
          className="p-1.5 rounded-md hover:bg-accent active:bg-accent/80 transition-colors touch-manipulation"
        >
          <ChevronRight size={16} className="text-muted-foreground" />
        </button>
      </div>

      {/* Week day headers - more compact */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {weekDays.map((day) => (
          <div
            key={day.toString()}
            className="text-center text-[10px] font-medium text-muted-foreground/70"
          >
            {format(day, "EEEEE")}
          </div>
        ))}
      </div>

      {/* Calendar grid - more compact */}
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day) => {
          const isSelected = isSameDay(day, currentDate);
          const isCurrentMonth = isSameMonth(day, displayMonth);
          const isCurrentDay = isToday(day);
          const dayEvents = getAllEventsForDay(events, day);
          const hasEvents = dayEvents.length > 0;

          return (
            <button
              key={day.toString()}
              onClick={() => handleDateClick(day)}
              className={cn(
                "relative rounded-full text-xs font-medium transition-all touch-manipulation",
                "flex items-center justify-center h-6 w-6 mx-auto",
                !isCurrentMonth && "text-muted-foreground/30",
                isCurrentMonth &&
                  !isSelected &&
                  "hover:bg-accent/50 text-foreground/80",
                isSelected && "bg-primary text-primary-foreground",
                isCurrentDay && !isSelected && "text-primary font-semibold",
              )}
            >
              {format(day, "d")}
              {/* Event indicator dot */}
              {hasEvents && !isSelected && (
                <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary/60" />
              )}
              {hasEvents && isSelected && (
                <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary-foreground/60" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
