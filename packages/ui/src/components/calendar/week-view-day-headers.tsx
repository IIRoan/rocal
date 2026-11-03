import {
  formatCalendarDayKey,
  isTodayInTimezone,
} from "@workspace/calendar-core";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

import { cn } from "../../lib/utils";

export function WeekViewDayHeaders({
  currentDate,
  days,
  timezone,
}: {
  currentDate: Date;
  days: Date[];
  timezone: string;
}) {
  // Matches the time grid and all-day row at every width so day columns line up.
  const gridTemplateColumns = `3rem repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="z-40 bg-background shrink-0 overflow-hidden [scrollbar-gutter:stable]">
      <div
        className="hidden w-full items-center justify-between pt-3 sm:grid border-b border-border/40"
        style={{ gridTemplateColumns }}
      >
        <div className="caption text-right text-muted-foreground text-[11px] pr-1.5">
          {formatInTimeZone(currentDate, timezone, "zzz")}
        </div>
        {days.map((day) => {
          const today = isTodayInTimezone(day, timezone);
          return (
            <div
              key={formatCalendarDayKey(day)}
              className="caption w-full text-center text-muted-foreground tabular-nums"
            >
              <span
                aria-current={today ? "date" : undefined}
                className={cn(
                  "text-[11px] font-medium uppercase tracking-wider",
                  today
                    ? "rounded-md bg-accent px-2 py-1 font-medium text-accent-foreground"
                    : "",
                )}
              >
                {today && <span className="sr-only">Today, </span>}
                {format(day, "EEE")} {format(day, "d")}
              </span>
            </div>
          );
        })}
      </div>

      <div
        className="sm:hidden grid border-b border-border/40 pt-2"
        style={{ gridTemplateColumns }}
      >
        <div className="flex items-center justify-end text-[10px] font-medium text-muted-foreground pr-1">
          {formatInTimeZone(currentDate, timezone, "zzz")}
        </div>
        {days.map((day) => {
          const today = isTodayInTimezone(day, timezone);
          return (
            <div
              key={formatCalendarDayKey(day)}
              className="w-full text-center text-muted-foreground tabular-nums"
            >
              <span
                aria-current={today ? "date" : undefined}
                className={cn(
                  "text-[11px] font-medium uppercase",
                  today
                    ? "rounded-md bg-accent px-1.5 py-0.5 font-medium text-accent-foreground"
                    : "",
                )}
              >
                {today && <span className="sr-only">Today, </span>}
                {format(day, "E")[0]} {format(day, "d")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
