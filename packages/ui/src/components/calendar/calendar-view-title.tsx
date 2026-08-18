import { addDays, format, isSameMonth } from "date-fns";
import { getWeekCalendarRange } from "@workspace/calendar-core";

import { AgendaDaysToShow } from "./constants";
import type { CalendarView } from "./types";

function formatMonthYear(date: Date) {
  return (
    <>
      <span className="font-bold">{format(date, "MMMM")}</span>
      <span className="text-muted-foreground"> {format(date, "yyyy")}</span>
    </>
  );
}

export function CalendarViewTitle({
  currentDate,
  view,
  weekStartDay,
  timezone,
}: {
  currentDate: Date;
  view: CalendarView;
  weekStartDay: number;
  timezone: string;
}) {
  if (view === "month") {
    return formatMonthYear(currentDate);
  }

  if (view === "week") {
    const { start, end } = getWeekCalendarRange(
      currentDate,
      weekStartDay,
      timezone,
    );
    if (isSameMonth(start, end)) {
      return formatMonthYear(start);
    }

    return (
      <>
        <span className="font-bold">{format(start, "MMM")}</span>
        <span className="text-muted-foreground"> - </span>
        <span className="font-bold">{format(end, "MMM")}</span>
        <span className="text-muted-foreground"> {format(end, "yyyy")}</span>
      </>
    );
  }

  if (view === "day") {
    return (
      <>
        <span className="min-sm:hidden" aria-hidden="true">
          {format(currentDate, "MMM d, yyyy")}
        </span>
        <span className="max-sm:hidden min-md:hidden" aria-hidden="true">
          {format(currentDate, "MMMM d, yyyy")}
        </span>
        <span className="max-md:hidden">
          {format(currentDate, "EEE MMMM d, yyyy")}
        </span>
      </>
    );
  }

  if (view === "3day") {
    const start = addDays(currentDate, -1);
    const end = addDays(currentDate, 1);
    if (isSameMonth(start, end)) {
      return (
        <>
          <span className="font-bold">
            {format(start, "MMM d")} – {format(end, "d")}
          </span>
          <span className="text-muted-foreground"> {format(end, "yyyy")}</span>
        </>
      );
    }

    return (
      <>
        <span className="font-bold">{format(start, "MMM d")}</span>
        <span className="text-muted-foreground"> – </span>
        <span className="font-bold">{format(end, "MMM d")}</span>
        <span className="text-muted-foreground"> {format(end, "yyyy")}</span>
      </>
    );
  }

  if (view === "agenda") {
    const start = currentDate;
    const end = addDays(currentDate, AgendaDaysToShow - 1);

    if (isSameMonth(start, end)) {
      return formatMonthYear(start);
    }

    return (
      <>
        <span className="font-bold">{format(start, "MMM")}</span>
        <span className="text-muted-foreground"> - </span>
        <span className="font-bold">{format(end, "MMM")}</span>
        <span className="text-muted-foreground"> {format(end, "yyyy")}</span>
      </>
    );
  }

  return formatMonthYear(currentDate);
}

export function MobileCalendarViewTitle({
  currentDate,
  view,
  weekStartDay,
  timezone,
}: {
  currentDate: Date;
  view: CalendarView;
  weekStartDay: number;
  timezone: string;
}) {
  if (view === "month") {
    return format(currentDate, "MMMM yyyy");
  }

  if (view === "week") {
    const { start, end } = getWeekCalendarRange(
      currentDate,
      weekStartDay,
      timezone,
    );
    if (isSameMonth(start, end)) {
      return format(start, "MMMM yyyy");
    }

    return `${format(start, "MMM")} - ${format(end, "MMM yyyy")}`;
  }

  if (view === "day") {
    return (
      <>
        <span className="min-sm:hidden" aria-hidden="true">
          {format(currentDate, "MMM d, yyyy")}
        </span>
        <span className="max-sm:hidden min-md:hidden" aria-hidden="true">
          {format(currentDate, "MMMM d, yyyy")}
        </span>
        <span className="max-md:hidden">
          {format(currentDate, "EEE MMMM d, yyyy")}
        </span>
      </>
    );
  }

  if (view === "3day") {
    const start = addDays(currentDate, -1);
    const end = addDays(currentDate, 1);
    if (isSameMonth(start, end)) {
      return `${format(start, "MMM d")} - ${format(end, "d, yyyy")}`;
    }

    return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`;
  }

  if (view === "agenda") {
    const start = currentDate;
    const end = addDays(currentDate, AgendaDaysToShow - 1);

    if (isSameMonth(start, end)) {
      return format(start, "MMMM yyyy");
    }

    return `${format(start, "MMM")} - ${format(end, "MMM yyyy")}`;
  }

  return format(currentDate, "MMMM yyyy");
}
