"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, getWeek } from "date-fns";

interface MobileWeekNavProps {
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onTodayClick?: () => void;
  className?: string;
}

export function MobileWeekNav({
  currentDate,
  onDateChange,
  onTodayClick,
  className,
}: MobileWeekNavProps) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  
  const handlePrevWeek = () => {
    onDateChange(subWeeks(currentDate, 1));
  };
  
  const handleNextWeek = () => {
    onDateChange(addWeeks(currentDate, 1));
  };
  
  const handleToday = () => {
    onDateChange(new Date());
    onTodayClick?.();
  };
  
  const isSameWeek = (date1: Date, date2: Date) => {
    const week1Start = startOfWeek(date1, { weekStartsOn: 1 });
    const week2Start = startOfWeek(date2, { weekStartsOn: 1 });
    return week1Start.getTime() === week2Start.getTime();
  };
  
  const isCurrentWeek = isSameWeek(currentDate, new Date());

  return (
    <div
      className={cn(
        "sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border md:hidden",
        className
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 safe-area-inset-top">
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePrevWeek}
          className="p-2"
        >
          <ChevronLeft size={20} />
        </Button>
        
        <div className="flex-1 text-center">
          <div className="text-sm font-medium">
            {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Week {format(currentDate, "w")}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {!isCurrentWeek && (
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
            onClick={handleNextWeek}
            className="p-2"
          >
            <ChevronRight size={20} />
          </Button>
        </div>
      </div>
    </div>
  );
}