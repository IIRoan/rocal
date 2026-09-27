import { useCallback, useRef } from "react";
import {
  formatCalendarDayKey,
  getAgendaPageDate,
  utcToPickerDate,
} from "@workspace/calendar-core";
import { isTimelineCalendarView } from "../../lib/calendar-views";
import { useCalendarView } from "../../providers/CalendarViewProvider";
import { useSheet } from "../../providers/SheetProvider";
import type { NativeMonthCalendarHandle } from "./NativeMonthCalendar";
import type { NativeTimelineCalendarHandle } from "./NativeTimelineCalendar";

/** Prev/next/today and month-grid handlers for whichever calendar view is active. */
export function useCalendarViewNavigation(timezone: string) {
  const { openEventSheet } = useSheet();
  const {
    activeView,
    selectedDate,
    setActiveView,
    setCurrentDate,
    setSelectedDate,
  } = useCalendarView();
  const timelineRef = useRef<NativeTimelineCalendarHandle>(null);
  const monthRef = useRef<NativeMonthCalendarHandle>(null);

  const showDate = useCallback(
    (date: Date) => {
      setCurrentDate(date);
      setSelectedDate(date);
    },
    [setCurrentDate, setSelectedDate],
  );

  const navigate = useCallback(
    (direction: 1 | -1) => {
      if (isTimelineCalendarView(activeView)) {
        if (direction === 1) timelineRef.current?.goToNextPage(true);
        else timelineRef.current?.goToPrevPage(true);
        return;
      }
      if (activeView === "month") {
        if (direction === 1) monthRef.current?.goToNextPage();
        else monthRef.current?.goToPrevPage();
        return;
      }
      showDate(getAgendaPageDate(selectedDate, direction));
    },
    [activeView, selectedDate, showDate],
  );

  const handleNavigateForward = useCallback(() => navigate(1), [navigate]);
  const handleNavigateBackward = useCallback(() => navigate(-1), [navigate]);

  const handleTodayPress = useCallback(() => {
    const today = utcToPickerDate(new Date(), timezone);
    showDate(today);
    if (isTimelineCalendarView(activeView)) {
      timelineRef.current?.goToDate(today, { animated: true, hourScroll: true });
    }
  }, [activeView, showDate, timezone]);

  const handleMonthDayPress = useCallback(
    (date: Date) => {
      showDate(date);
      setActiveView("day");
    },
    [setActiveView, showDate],
  );

  const handleMonthCreateAtDay = useCallback(
    (date: Date) => {
      openEventSheet({
        type: "create",
        date: formatCalendarDayKey(date),
        hour: "9",
      });
    },
    [openEventSheet],
  );

  return {
    timelineRef,
    monthRef,
    handleNavigateForward,
    handleNavigateBackward,
    handleTodayPress,
    handleMonthChange: showDate,
    handleMonthDayPress,
    handleMonthCreateAtDay,
  };
}
