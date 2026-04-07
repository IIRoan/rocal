"use client";

import { useEffect, useRef, useCallback } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { format, parse, startOfDay } from "date-fns";
import { useCalendarContext, CALENDAR_VIEWS } from "@workspace/ui/components/calendar";
import type { CalendarView } from "@workspace/ui/components/calendar";

const DATE_PARAM = "date";
const VIEW_PARAM = "view";
const DATE_FORMAT = "yyyy-MM-dd";

function parseDateParam(value: string | null): Date | null {
  if (!value) return null;
  try {
    const parsed = parse(value, DATE_FORMAT, new Date());
    if (!isNaN(parsed.getTime())) {
      return startOfDay(parsed);
    }
  } catch {
    // ignore
  }
  return null;
}

function parseViewParam(value: string | null): CalendarView | null {
  if (!value) return null;
  if ((CALENDAR_VIEWS as readonly string[]).includes(value)) {
    return value as CalendarView;
  }
  return null;
}

function formatDateParam(date: Date): string {
  return format(date, DATE_FORMAT);
}

export function useCalendarUrlSync() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { currentDate, setCurrentDate, currentView, setCurrentView } =
    useCalendarContext();
  const initializedRef = useRef(false);
  const isUpdatingUrlRef = useRef(false);

  // On initial mount, read date/view from URL and apply them
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const dateParam = searchParams.get(DATE_PARAM);
    const parsed = parseDateParam(dateParam);
    if (parsed) {
      setCurrentDate(parsed);
    }

    const viewParam = searchParams.get(VIEW_PARAM);
    const parsedView = parseViewParam(viewParam);
    if (parsedView) {
      setCurrentView(parsedView);
    }
  }, [searchParams, setCurrentDate, setCurrentView]);

  // Update URL whenever currentDate or currentView changes
  const updateUrl = useCallback(
    (date: Date, view: CalendarView) => {
      if (!initializedRef.current) return;
      if (isUpdatingUrlRef.current) return;

      isUpdatingUrlRef.current = true;
      try {
        const params = new URLSearchParams(window.location.search);

        params.set(DATE_PARAM, formatDateParam(date));
        params.set(VIEW_PARAM, view);

        const newSearch = params.toString();
        const newUrl = `${pathname}${newSearch ? `?${newSearch}` : ""}`;

        window.history.replaceState(null, "", newUrl);
      } finally {
        queueMicrotask(() => {
          isUpdatingUrlRef.current = false;
        });
      }
    },
    [pathname],
  );

  useEffect(() => {
    updateUrl(currentDate, currentView);
  }, [currentDate, currentView, updateUrl]);
}
