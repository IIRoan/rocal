"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  format,
  isSameDay,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { useCalendarContext } from "../calendar/calendar-context";
import { CalendarEvent } from "../calendar/types";
import { resolveInlineColorValue } from "../calendar/utils";
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
  getCachedEventsForRange?: (range: { start: Date; end: Date }) => CalendarEvent[] | undefined;
  prefetchRange?: (range: { start: Date; end: Date }) => void;
  onDateSelect?: (date: Date) => void;
  className?: string;
  isMobile?: boolean;
}

export function SidebarCalendar({
  getCachedEventsForRange,
  prefetchRange,
  onDateSelect,
  className,
  isMobile = false,
}: SidebarCalendarProps) {
  const { currentDate, setCurrentDate, calendars, getVisibleCalendars } =
    useCalendarContext();
  const [calendarMonth, setCalendarMonth] = useState<Date>(currentDate);
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const swipeLockRef = useRef(false);

  const visibleCalendarIds = useMemo(
    () => new Set(getVisibleCalendars().map((calendar) => calendar.id)),
    [getVisibleCalendars],
  );

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
    calendars,
    visibleCalendarIds,
    getCachedEventsForRange,
    prefetchRange,
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

  const hoverPrefetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchMonth = (month: Date) => {
    if (!prefetchRange) return;
    prefetchRange({ start: startOfMonth(month), end: endOfMonth(month) });
  };
  const schedulePrefetch = (month: Date) => {
    if (hoverPrefetchRef.current) clearTimeout(hoverPrefetchRef.current);
    hoverPrefetchRef.current = setTimeout(() => prefetchMonth(month), 80);
  };
  const cancelPrefetch = () => {
    if (hoverPrefetchRef.current) clearTimeout(hoverPrefetchRef.current);
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
      <div className="flex w-full items-center justify-between mb-1">
        <button
          onClick={() => {
            const now = new Date();
            const isGoingForward = now.getTime() >= calendarMonth.getTime();
            setSlideDirection(isGoingForward ? 1 : -1);
            setCalendarMonth(now);
            setCurrentDate(now);
            onDateSelect?.(now);
          }}
          className="text-sm tracking-tight text-left hover:opacity-80 transition-opacity"
        >
          <span className="font-semibold text-foreground">{format(calendarMonth, "MMMM")}</span>
          <span className="text-muted-foreground ml-0.5">{format(calendarMonth, "yyyy")}</span>
        </button>
        <div className="flex items-center">
          <button
            onClick={goToPreviousMonth}
            onMouseEnter={() => schedulePrefetch(subMonths(calendarMonth, 1))}
            onMouseLeave={cancelPrefetch}
            className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} strokeWidth={2} />
          </button>
          <button
            onClick={goToNextMonth}
            onMouseEnter={() => schedulePrefetch(addMonths(calendarMonth, 1))}
            onMouseLeave={cancelPrefetch}
            className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Next month"
          >
            <ChevronRight size={16} strokeWidth={2} />
          </button>
        </div>
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
          <div className="grid grid-cols-7 mb-0.5">
            {weekdayLabels.map((label, index) => (
              <div
                key={`${label}-${index}`}
                className="h-7 flex items-center justify-center text-[11px] font-medium text-muted-foreground/50 uppercase"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
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
                  onMouseEnter={() => schedulePrefetch(day)}
                  onMouseLeave={cancelPrefetch}
                  className={cn(
                    "relative flex items-center justify-center transition-transform",
                    isMobile
                      ? "aspect-square rounded-[12px] text-[14px] active:scale-90 flex-col gap-1"
                      : "aspect-square rounded-lg text-[13px] font-medium",
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
                          : "absolute bottom-[3px] gap-[2px] w-full",
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
                              : resolveInlineColorValue(event.color),
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
