"use client";

import { useEffect, useState } from "react";
import { endOfWeek, isSameDay, isWithinInterval, startOfWeek } from "date-fns";
import { StartHour, EndHour } from "../components/calendar/constants";

function getCurrentTimeInTimezone(timezone?: string): { hours: number; minutes: number; date: Date } {
  if (!timezone) {
    const now = new Date();
    return {
      hours: now.getHours(),
      minutes: now.getMinutes(),
      date: now
    };
  }

  // Use Intl.DateTimeFormat to get current time in the specified timezone
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const timeString = formatter.format(now);
  const [hoursStr, minutesStr] = timeString.split(':');
  const hours = parseInt(hoursStr || '0', 10);
  const minutes = parseInt(minutesStr || '0', 10);

  // Create a date object representing today in the specified timezone
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const dateString = dateFormatter.format(now);
  const [monthStr, dayStr, yearStr] = dateString.split('/');
  const timezoneDate = new Date(
    parseInt(yearStr || '2025', 10), 
    parseInt(monthStr || '1', 10) - 1, 
    parseInt(dayStr || '1', 10)
  );

  return { hours, minutes, date: timezoneDate };
}

export function useCurrentTimeIndicator(
  currentDate: Date,
  view: "day" | "week",
  timezone?: string,
) {
  const [currentTimePosition, setCurrentTimePosition] = useState<number>(0);
  const [currentTimeVisible, setCurrentTimeVisible] = useState<boolean>(false);

  useEffect(() => {
    const calculateTimePosition = () => {
      const { hours, minutes, date: timezoneDate } = getCurrentTimeInTimezone(timezone);
      
      console.log("Timezone:", timezone);
      console.log("Current time in timezone:", `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`);
      console.log("Local browser time:", new Date().toLocaleTimeString());
      console.log("StartHour:", StartHour, "EndHour:", EndHour);
      
      const totalMinutes = (hours - StartHour) * 60 + minutes;
      const dayStartMinutes = 0;
      // EndHour is 23, but we need to include the full 24th hour (23:00-23:59)
      // So the total range should be 24 hours (0-23:59)
      const dayEndMinutes = 24 * 60; // Full 24 hours in minutes

      console.log("Calculation details:");
      console.log("- hours:", hours, "minutes:", minutes);
      console.log("- totalMinutes:", totalMinutes);
      console.log("- dayStartMinutes:", dayStartMinutes);
      console.log("- dayEndMinutes:", dayEndMinutes);

      // Calculate position as percentage of day
      const position =
        ((totalMinutes - dayStartMinutes) / (dayEndMinutes - dayStartMinutes)) * 100;
        
      console.log("- calculated position:", position + "%");

      // Check if current day is in view based on the calendar view
      let isCurrentTimeVisible = false;

      if (view === "day") {
        isCurrentTimeVisible = isSameDay(timezoneDate, currentDate);
      } else if (view === "week") {
        const startOfWeekDate = startOfWeek(currentDate, { weekStartsOn: 0 });
        const endOfWeekDate = endOfWeek(currentDate, { weekStartsOn: 0 });
        isCurrentTimeVisible = isWithinInterval(timezoneDate, {
          start: startOfWeekDate,
          end: endOfWeekDate,
        });
      }

      setCurrentTimePosition(position);
      setCurrentTimeVisible(isCurrentTimeVisible);
    };

    // Calculate immediately
    calculateTimePosition();

    // Update every minute
    const interval = setInterval(calculateTimePosition, 60000);

    return () => clearInterval(interval);
  }, [currentDate, view, timezone]);

  return { currentTimePosition, currentTimeVisible };
}
