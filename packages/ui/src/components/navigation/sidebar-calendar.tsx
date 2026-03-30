"use client";

import { useEffect, useRef, useState } from "react";
import {
  format,
  isSameDay,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { useCalendarContext } from "../calendar/calendar-context";
import { CalendarEvent } from "../calendar/types";
import { resolveEventColorValue } from "../calendar/utils";
import { cn } from "../../lib/utils";
import { useHorizontalSwipeGesture } from "../../hooks/use-horizontal-swipe-gesture";
import { useMiniCalendarMonthData } from "../../hooks/use-mini-calendar-month-data";

const monthSlideVariants = {
  enter: (direction: 1 | -1) => ({
    x: direction > 0 ? 18 : -18,
  }),
  center: {
    x: 0,
  },
  exit: (direction: 1 | -1) => ({
    x: direction > 0 ? -18 : 18,
  }),
};

interface SidebarCalendarProps {
  events?: CalendarEvent[];
  onDisplayMonthChange?: (dateRange: { start: Date; end: Date }) => void;
  onDateSelect?: (date: Date) => void;
  rangeChangeDebounceMs?: number;
  className?: string;
  isMobile?: boolean;
}

export function SidebarCalendar({
  events = [],
  onDisplayMonthChange,
  onDateSelect,
  rangeChangeDebounceMs = 120,
  className,
  isMobile = false,
}: SidebarCalendarProps) {
  const { currentDate, setCurrentDate } = useCalendarContext();
  const [calendarMonth, setCalendarMonth] = useState<Date>(currentDate);
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const swipeLockRef = useRef(false);

  useEffect(() => {
    if (currentDate && !isNaN(currentDate.getTime())) {
      setCalendarMonth(currentDate);
    } else {
      const now = new Date();
      setCalendarMonth(now);
      setCurrentDate(now);
    }
  }, [currentDate, setCurrentDate]);

  const weekdayLabels = ["M", "T", "W", "T", "F", "S", "S"];
  const { grid, dayEventsMap, monthKey, toDayKey } = useMiniCalendarMonthData({
    calendarMonth,
    events,
    onDisplayMonthChange,
    rangeChangeDebounceMs,
  });

  const goToPreviousMonth = () => {
    if (swipeLockRef.current) return;
    swipeLockRef.current = true;
    setSlideDirection(-1);
    setCalendarMonth((prev) => subMonths(prev, 1));
    window.setTimeout(() => {
      swipeLockRef.current = false;
    }, 100);
  };

  const goToNextMonth = () => {
    if (swipeLockRef.current) return;
    swipeLockRef.current = true;
    setSlideDirection(1);
    setCalendarMonth((prev) => addMonths(prev, 1));
    window.setTimeout(() => {
      swipeLockRef.current = false;
    }, 100);
  };

  const goToCurrentMonth = () => {
    const isGoingForward = currentDate.getTime() >= calendarMonth.getTime();
    setSlideDirection(isGoingForward ? 1 : -1);
    setCalendarMonth(currentDate);
  };

  useHorizontalSwipeGesture(containerRef, {
    onSwipeLeft: goToNextMonth,
    onSwipeRight: goToPreviousMonth,
    threshold: 40,
  });

  return (
    <div ref={containerRef} className={cn("w-full", className)}>
      <div className="flex items-center justify-between mb-4 px-1">
        <button
          onClick={goToPreviousMonth}
          className="p-2 rounded-full hover:bg-accent transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft size={20} className="text-muted-foreground" />
        </button>
        <button
          onClick={goToCurrentMonth}
          className="text-[15px] font-bold tracking-tight"
        >
          {format(calendarMonth, "MMMM yyyy")}
        </button>
        <button
          onClick={goToNextMonth}
          className="p-2 rounded-full hover:bg-accent transition-colors"
          aria-label="Next month"
        >
          <ChevronRight size={20} className="text-muted-foreground" />
        </button>
      </div>

      <div className="relative overflow-hidden">
        <motion.div
          key={monthKey}
          custom={slideDirection}
          variants={monthSlideVariants}
          initial="enter"
          animate="center"
          transition={{ duration: 0.09, ease: [0.22, 1, 0.36, 1] }}
        >
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
            {grid.days.map((day) => {
              const isSelected = isSameDay(day, currentDate);
              const isCurrentMonth = isSameMonth(day, calendarMonth);
              const isCurrentDay = isToday(day);
              const dayEvents = dayEventsMap.get(toDayKey(day)) || [];

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => {
                    setCurrentDate(day);
                    onDateSelect?.(day);
                  }}
                  className={cn(
                    "relative flex items-center justify-center transition-transform",
                    isMobile
                      ? "aspect-square rounded-[12px] text-[14px] active:scale-90 flex-col gap-1"
                      : "h-8 w-8 mx-auto rounded-lg text-[13px] font-medium",
                    !isCurrentMonth && "text-muted-foreground/30",
                    isCurrentMonth &&
                      !isSelected &&
                      !isCurrentDay &&
                      "text-foreground hover:bg-accent/60",
                    isCurrentDay &&
                      !isSelected &&
                      "ring-2 ring-inset ring-foreground/20 text-foreground font-bold hover:bg-accent/60",
                    isCurrentDay &&
                      isSelected &&
                      "ring-2 ring-inset ring-foreground/40",
                  )}
                >
                  {isSelected && (
                    <div
                      className={cn(
                        "absolute inset-0.5 rounded-md bg-primary shadow-sm",
                        isMobile && "inset-0 rounded-[12px]",
                      )}
                    />
                  )}
                  <span className="relative z-10 text-inherit data-[selected=true]:text-primary-foreground">
                    <span className={cn(isSelected && "text-primary-foreground")}>
                      {format(day, "d")}
                    </span>
                  </span>
                  {dayEvents.length > 0 && (
                    <div
                      className={cn(
                        "flex items-center justify-center z-10",
                        isMobile
                          ? "gap-0.5 mt-[-2px]"
                          : "absolute bottom-[6px] gap-[2px] w-full",
                      )}
                    >
                      {dayEvents.slice(0, 3).map((event, i) => (
                        <div
                          key={`${event.id || "event"}-${i}`}
                          className={cn(
                            "rounded-full",
                            isMobile ? "w-1 h-1" : "w-1 h-1",
                            isSelected && "dark:bg-black bg-white",
                          )}
                          style={{
                            backgroundColor: isSelected
                              ? undefined
                              : resolveEventColorValue(event.color),
                          }}
                        />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
