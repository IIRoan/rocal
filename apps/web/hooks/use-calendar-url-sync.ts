"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import {
  formatInstantCalendarDayKey,
  resolveTimezone,
  wallClockFromCalendarDayKey,
} from "@workspace/calendar-core";
import {
  useCalendarContext,
  CALENDAR_VIEWS,
} from "@workspace/ui/components/calendar";
import type { CalendarView } from "@workspace/ui/components/calendar";
import { useSettings } from "@/hooks/use-settings";

const DATE_PARAM = "date";
const VIEW_PARAM = "view";

/** Noon in the account zone keeps the day intact whatever zone the browser is in. */
export function parseDateParam(
  value: string | null,
  timezone: string,
): Date | null {
  if (!value) return null;
  return wallClockFromCalendarDayKey(value, 12, 0, timezone);
}

function parseViewParam(value: string | null): CalendarView | null {
  if (!value) return null;
  if ((CALENDAR_VIEWS as readonly string[]).includes(value)) {
    return value as CalendarView;
  }
  return null;
}

export function useCalendarUrlSync() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { currentDate, setCurrentDate, currentView, setCurrentView } =
    useCalendarContext();
  const { settings, loading: settingsLoading } = useSettings();
  const timezone = resolveTimezone(settings?.timezone);
  const initializedRef = useRef(false);

  // The URL day is read in the account zone, so wait for settings before applying it.
  useEffect(() => {
    if (initializedRef.current || settingsLoading) return;
    initializedRef.current = true;

    const dateParam = searchParams.get(DATE_PARAM);
    const parsed = parseDateParam(dateParam, timezone);
    if (parsed) {
      setCurrentDate(parsed);
    }

    const viewParam = searchParams.get(VIEW_PARAM);
    const parsedView = parseViewParam(viewParam);
    if (parsedView) {
      setCurrentView(parsedView);
    }
  }, [searchParams, setCurrentDate, setCurrentView, settingsLoading, timezone]);

  // A run in the same commit as the init still sees the pre-URL state; the commit that applies the URL writes it back.
  useEffect(() => {
    if (!initializedRef.current) return;

    const params = new URLSearchParams(window.location.search);

    params.set(DATE_PARAM, formatInstantCalendarDayKey(currentDate, timezone));
    params.set(VIEW_PARAM, currentView);

    const newSearch = params.toString();
    const path = pathname ?? window.location.pathname;
    const newUrl = `${path}${newSearch ? `?${newSearch}` : ""}`;

    window.history.replaceState(null, "", newUrl);
  }, [currentDate, currentView, pathname, timezone]);
}
