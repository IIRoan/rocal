"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
} from "date-fns";
import { CalendarView } from "../calendar/types";
import { AgendaDaysToShow } from "../calendar/constants";

interface MobileWeekNavProps {
  currentDate: Date;
  currentView: CalendarView;
  onDateChange: (date: Date) => void;
  onTodayClick?: () => void;
  className?: string;
}

export function MobileWeekNav({
  currentDate,
  currentView,
  onDateChange,
  onTodayClick,
  className,
}: MobileWeekNavProps) {
  const handlePrevious = () => {
    let newDate: Date;
    switch (currentView) {
      case "day":
        newDate = subDays(currentDate, 1);
        break;
      case "week":
        newDate = subWeeks(currentDate, 1);
        break;
      case "month":
        newDate = subMonths(currentDate, 1);
        break;
      case "agenda":
        newDate = subDays(currentDate, AgendaDaysToShow);
        break;
      default:
        newDate = subWeeks(currentDate, 1);
    }
    onDateChange(newDate);
  };

  const handleNext = () => {
    let newDate: Date;
    switch (currentView) {
      case "day":
        newDate = addDays(currentDate, 1);
        break;
      case "week":
        newDate = addWeeks(currentDate, 1);
        break;
      case "month":
        newDate = addMonths(currentDate, 1);
        break;
      case "agenda":
        newDate = addDays(currentDate, AgendaDaysToShow);
        break;
      default:
        newDate = addWeeks(currentDate, 1);
    }
    onDateChange(newDate);
  };

  const handleToday = () => {
    onDateChange(new Date());
    onTodayClick?.();
  };

  const getDisplayText = () => {
    switch (currentView) {
      case "day":
        return {
          main: format(currentDate, "EEEE, MMM d"),
          sub: format(currentDate, "yyyy"),
        };
      case "week":
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
        return {
          main: `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d, yyyy")}`,
          sub: `Week ${format(currentDate, "w")}`,
        };
      case "month":
        return {
          main: format(currentDate, "MMMM yyyy"),
          sub: "",
        };
      case "agenda":
        const agendaEnd = addDays(currentDate, AgendaDaysToShow - 1);
        if (isSameMonth(currentDate, agendaEnd)) {
          return {
            main: format(currentDate, "MMMM yyyy"),
            sub: `${AgendaDaysToShow} days`,
          };
        } else {
          return {
            main: `${format(currentDate, "MMM")} - ${format(agendaEnd, "MMM yyyy")}`,
            sub: `${AgendaDaysToShow} days`,
          };
        }
      default:
        const defaultWeekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const defaultWeekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
        return {
          main: `${format(defaultWeekStart, "MMM d")} - ${format(defaultWeekEnd, "MMM d, yyyy")}`,
          sub: `Week ${format(currentDate, "w")}`,
        };
    }
  };

  const isToday = () => {
    const today = new Date();
    switch (currentView) {
      case "day":
        return isSameDay(currentDate, today);
      case "week":
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
        return today >= weekStart && today <= weekEnd;
      case "month":
        return isSameMonth(currentDate, today);
      case "agenda":
        const agendaEnd = addDays(currentDate, AgendaDaysToShow - 1);
        return today >= currentDate && today <= agendaEnd;
      default:
        return false;
    }
  };

  const displayText = getDisplayText();
  const isCurrentPeriod = isToday();

  return (
    <div
      className={cn(
        "sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border md:hidden",
        className,
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 safe-area-inset-top">
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePrevious}
          className="p-2"
        >
          <ChevronLeft size={20} />
        </Button>

        <div className="flex-1 text-center">
          <div className="text-sm font-medium">{displayText.main}</div>
          {displayText.sub && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {displayText.sub}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isCurrentPeriod && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleToday}
              className="text-xs px-3 py-1.5 h-auto"
            >
              Today
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNext}
            className="p-2"
          >
            <ChevronRight size={20} />
          </Button>
        </div>
      </div>
    </div>
  );
}
