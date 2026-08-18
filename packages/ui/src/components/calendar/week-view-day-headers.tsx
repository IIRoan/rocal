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
  return (
    <div className="z-40 bg-background/95 backdrop-blur-md shrink-0">
      <div className="hidden w-full grid-cols-[3rem_repeat(7,minmax(0,1fr))] items-center justify-between pt-3 sm:grid border-b border-border/40">
        <div className="caption text-right text-muted-foreground/40 text-[9px] pr-1.5">
          {formatInTimeZone(currentDate, timezone, "zzz")}
        </div>
        {days.map((day) => (
          <div
            key={formatCalendarDayKey(day)}
            className="caption w-full text-center text-muted-foreground/70"
          >
            <span
              className={cn(
                "text-[11px] font-medium uppercase tracking-wider",
                isTodayInTimezone(day, timezone)
                  ? "rounded-md bg-primary px-2 py-1 font-medium text-primary-foreground"
                  : "",
              )}
            >
              {format(day, "EEE")} {format(day, "d")}
            </span>
          </div>
        ))}
      </div>

      <div className="sm:hidden grid grid-cols-[2.5rem_repeat(7,minmax(0,1fr))] border-b border-border/40 pt-2">
        <div className="flex items-center justify-end text-[8px] font-medium text-muted-foreground/40 pr-1">
          {formatInTimeZone(currentDate, timezone, "zzz")}
        </div>
        {days.map((day) => (
          <div
            key={formatCalendarDayKey(day)}
            className="w-full text-center text-muted-foreground/70"
          >
            <span
              className={cn(
                "text-[10px] font-medium uppercase",
                isTodayInTimezone(day, timezone)
                  ? "rounded-md bg-primary px-1.5 py-0.5 font-medium text-primary-foreground"
                  : "",
              )}
            >
              {format(day, "E")[0]} {format(day, "d")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
