"use client";

import { useMemo, useRef, useEffect } from "react";
import {
  addDays,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  startOfWeek,
} from "date-fns";
import { cn } from "../../lib/utils";
import { useCalendarContext } from "./calendar-context";
import { getAllEventsForDay, resolveInlineColorValue } from "./utils";
import { CalendarEvent } from "./types";

interface MobileDayStripProps {
  events?: CalendarEvent[];
  className?: string;
  weekStartDay?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

export function MobileDayStrip({
  events = [],
  className,
  weekStartDay = 1,
}: MobileDayStripProps) {
  const { currentDate, setCurrentDate } = useCalendarContext();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const selectedDayRef = useRef<HTMLButtonElement>(null);

  const days = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: weekStartDay });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: weekStartDay });
    const weekDays = [];
    for (let d = weekStart; d <= weekEnd; d = addDays(d, 1)) {
      weekDays.push(d);
    }
    return weekDays;
  }, [currentDate, weekStartDay]);

  // Scroll to selected day on mount and when date changes
  useEffect(() => {
    if (selectedDayRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const selected = selectedDayRef.current;
      const containerRect = container.getBoundingClientRect();
      const selectedRect = selected.getBoundingClientRect();

      // Only scroll if the selected day is not fully visible
      const isVisible =
        selectedRect.left >= containerRect.left &&
        selectedRect.right <= containerRect.right;

      if (!isVisible) {
        selected.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      }
    }
  }, [currentDate]);

  const handleDayClick = (date: Date) => {
    setCurrentDate(date);
  };

  return (
    <div
      className={cn(
        "bg-background/95 backdrop-blur-sm border-b border-border/50",
        className,
      )}
    >
      <div
        ref={scrollContainerRef}
        className="flex overflow-x-auto scrollbar-hide px-2 py-1.5 gap-1"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {days.map((day) => {
          const isSelected = isSameDay(day, currentDate);
          const isCurrentDay = isToday(day);
          const dayEvents = getAllEventsForDay(events, day);
          const hasEvents = dayEvents.length > 0;

          return (
            <button
              key={day.toString()}
              ref={isSelected ? selectedDayRef : null}
              onClick={() => handleDayClick(day)}
              className={cn(
                "flex-shrink-0 flex flex-col items-center justify-center min-w-[44px] h-[52px] rounded-lg transition-all touch-manipulation",
                "relative",
                isSelected && "bg-primary text-primary-foreground shadow-md",
                !isSelected &&
                  isCurrentDay &&
                  "bg-accent/60 ring-1.5 ring-primary/40",
                !isSelected &&
                  !isCurrentDay &&
                  "hover:bg-accent/30 active:bg-accent/50",
              )}
            >
              {/* Day abbreviation */}
              <span
                className={cn(
                  "text-[10px] font-medium uppercase",
                  isSelected
                    ? "text-primary-foreground/70"
                    : "text-muted-foreground",
                )}
              >
                {format(day, "EEE").slice(0, 3)}
              </span>

              {/* Day number */}
              <span
                className={cn(
                  "text-base font-semibold leading-tight",
                  isSelected
                    ? "text-primary-foreground"
                    : isCurrentDay
                      ? "text-primary"
                      : "text-foreground",
                )}
              >
                {format(day, "d")}
              </span>

              {/* Event indicator dots */}
              {hasEvents && (
                <div className="flex gap-0.5 mt-0.5">
                  {dayEvents.slice(0, 3).map((event, i) => (
                    <div
                      key={i}
                      className={cn(
                        "size-1 rounded-full",
                        isSelected
                          ? "bg-primary-foreground/50"
                          : event.color
                            ? ""
                            : "bg-primary/50",
                      )}
                      style={
                        !isSelected && event.color
                          ? { backgroundColor: resolveInlineColorValue(event.color) }
                          : undefined
                      }
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
