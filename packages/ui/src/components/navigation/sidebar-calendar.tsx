"use client";

import { useEffect, useState } from "react";
import { useCalendarContext } from "../calendar/calendar-context";
import { Calendar } from "../ui/calendar";
import { cn } from "../../lib/utils";

interface SidebarCalendarProps {
  className?: string;
}

export function SidebarCalendar({ className }: SidebarCalendarProps) {
  // Use the shared calendar context
  const { currentDate, setCurrentDate } = useCalendarContext();

  // Track the month to display in the calendar
  const [calendarMonth, setCalendarMonth] = useState<Date>(currentDate);

  // Update the calendar month whenever currentDate changes
  useEffect(() => {
    // Ensure currentDate is valid before setting calendar month
    if (currentDate && !isNaN(currentDate.getTime())) {
      setCalendarMonth(currentDate);
    } else {
      // Fallback to current date if invalid
      const now = new Date();
      setCalendarMonth(now);
      setCurrentDate(now);
    }
  }, [currentDate, setCurrentDate]);

  // Handle date selection
  const handleSelect = (date: Date | undefined) => {
    if (date) {
      setCurrentDate(date);
    } else {
      // If no date is selected, ensure we have a valid current date
      if (!currentDate || isNaN(currentDate.getTime())) {
        setCurrentDate(new Date());
      }
    }
  };

  // Handle month navigation
  const handleMonthChange = (month: Date) => {
    setCalendarMonth(month);
    // Don't automatically change the selected date when navigating months
    // Only update the calendar month display
  };

  return (
    <div className={cn("w-full flex justify-center", className)}>
      <Calendar
        mode="single"
        selected={currentDate}
        onSelect={handleSelect}
        month={calendarMonth}
        onMonthChange={handleMonthChange}
        classNames={{
          day_button:
            "transition-none! hover:not-in-data-selected:bg-sidebar-accent group-[.range-middle]:group-data-selected:bg-sidebar-accent text-sidebar-foreground",
          today: "*:after:transition-none",
          outside: "data-selected:bg-sidebar-accent/50",
        }}
      />
    </div>
  );
}
