"use client";

import {
  formatCalendarDayKey,
  isTodayInTimezone,
} from "@workspace/calendar-core";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

import { cn } from "../../lib/utils";
import { THREE_DAY_GRID_COLS } from "./three-day-view-utils";

export function ThreeDayViewDayHeaders({
  currentDate,
  days,
  timezone,
}: {
  currentDate: Date;
  days: Date[];
  timezone: string;
}) {
  return (
    <div
      className={cn(
        "z-40 grid shrink-0 border-b border-border/40 bg-background",
        THREE_DAY_GRID_COLS,
      )}
    >
      <div className="flex items-end justify-end pb-1.5 pr-1.5 text-[11px] text-muted-foreground">
        {formatInTimeZone(currentDate, timezone, "zzz")}
      </div>

      {days.map((day) => {
        const isSelected =
          day.getFullYear() === currentDate.getFullYear() &&
          day.getMonth() === currentDate.getMonth() &&
          day.getDate() === currentDate.getDate();
        const today = isTodayInTimezone(day, timezone);

        return (
          <div
            key={formatCalendarDayKey(day)}
            aria-current={today ? "date" : undefined}
            className={cn(
              "min-w-0 border-r border-border/50 py-1.5 text-center last:border-r-0",
              today && "bg-accent/5",
            )}
          >
            {today && <span className="sr-only">Today, </span>}
            <span
              className={cn(
                "block text-[11px] font-medium uppercase leading-none tracking-wide",
                isSelected ? "text-accent" : "text-muted-foreground",
              )}
            >
              {format(day, "EEE")}
            </span>
            <span
              className={cn(
                "mt-0.5 block text-sm font-semibold leading-tight tabular-nums",
                today ? "text-accent" : "text-foreground",
              )}
            >
              {format(day, "d")}
            </span>
            <div
              className={cn(
                "mx-auto mt-1 h-[2px] w-5 origin-center rounded-full transition-transform",
                today ? "scale-x-100 bg-accent" : "scale-x-0 bg-transparent",
              )}
            />
          </div>
        );
      })}
    </div>
  );
}
