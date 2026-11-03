import { format, isSameMonth } from "date-fns";
import {
  getAgendaLastDay,
  getWeekCalendarRange,
  utcToPickerDate,
} from "@workspace/calendar-core";

import { getThreeDayCalendarDays } from "./three-day-view-utils";
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
  const day = utcToPickerDate(currentDate, timezone);

  if (view === "month") {
    return formatMonthYear(day);
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
        <span className="text-muted-foreground"> – </span>
        <span className="font-bold">{format(end, "MMM")}</span>
        <span className="text-muted-foreground"> {format(end, "yyyy")}</span>
      </>
    );
  }

  if (view === "day") {
    return (
      <>
        <span className="min-sm:hidden" aria-hidden="true">
          {format(day, "MMM d, yyyy")}
        </span>
        <span className="max-sm:hidden min-md:hidden" aria-hidden="true">
          {format(day, "MMMM d, yyyy")}
        </span>
        <span className="max-md:hidden">
          {format(day, "EEE, MMMM d, yyyy")}
        </span>
      </>
    );
  }

  if (view === "3day") {
    const [start, , end] = getThreeDayCalendarDays(currentDate, timezone);
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
    const start = day;
    const end = getAgendaLastDay(day);

    if (isSameMonth(start, end)) {
      return formatMonthYear(start);
    }

    return (
      <>
        <span className="font-bold">{format(start, "MMM")}</span>
        <span className="text-muted-foreground"> – </span>
        <span className="font-bold">{format(end, "MMM")}</span>
        <span className="text-muted-foreground"> {format(end, "yyyy")}</span>
      </>
    );
  }

  return formatMonthYear(day);
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
  const day = utcToPickerDate(currentDate, timezone);

  if (view === "month") {
    return format(day, "MMMM yyyy");
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

    return `${format(start, "MMM")} – ${format(end, "MMM yyyy")}`;
  }

  if (view === "day") {
    return (
      <>
        <span className="min-sm:hidden" aria-hidden="true">
          {format(day, "MMM d, yyyy")}
        </span>
        <span className="max-sm:hidden min-md:hidden" aria-hidden="true">
          {format(day, "MMMM d, yyyy")}
        </span>
        <span className="max-md:hidden">
          {format(day, "EEE, MMMM d, yyyy")}
        </span>
      </>
    );
  }

  if (view === "3day") {
    const [start, , end] = getThreeDayCalendarDays(currentDate, timezone);
    if (isSameMonth(start, end)) {
      return `${format(start, "MMM d")} – ${format(end, "d, yyyy")}`;
    }

    return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
  }

  if (view === "agenda") {
    const start = day;
    const end = getAgendaLastDay(day);

    if (isSameMonth(start, end)) {
      return format(start, "MMMM yyyy");
    }

    return `${format(start, "MMM")} – ${format(end, "MMM yyyy")}`;
  }

  return format(day, "MMMM yyyy");
}
