import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { CalendarView } from "@workspace/calendar-core";

export type DetailCalendarView = CalendarView;

interface CalendarViewContextValue {
  activeView: DetailCalendarView;
  currentDate: Date;
  selectedDate: Date;
  setActiveView: (view: DetailCalendarView) => void;
  setCurrentDate: (date: React.SetStateAction<Date>) => void;
  setSelectedDate: (date: React.SetStateAction<Date>) => void;
}

const CalendarViewContext = createContext<CalendarViewContextValue | null>(null);

export function CalendarViewProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [activeView, setActiveViewState] = useState<DetailCalendarView>("day");
  const [currentDate, setCurrentDateState] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDateState] = useState<Date>(() => new Date());

  const setActiveView = useCallback((view: DetailCalendarView) => {
    setActiveViewState(view);
  }, []);

  const setCurrentDate = useCallback((date: React.SetStateAction<Date>) => {
    setCurrentDateState(date);
  }, []);

  const setSelectedDate = useCallback((date: React.SetStateAction<Date>) => {
    setSelectedDateState(date);
  }, []);

  const value = useMemo<CalendarViewContextValue>(
    () => ({
      activeView,
      currentDate,
      selectedDate,
      setActiveView,
      setCurrentDate,
      setSelectedDate,
    }),
    [
      activeView,
      currentDate,
      selectedDate,
      setActiveView,
      setCurrentDate,
      setSelectedDate,
    ],
  );

  return (
    <CalendarViewContext.Provider value={value}>
      {children}
    </CalendarViewContext.Provider>
  );
}

export function useCalendarView(): CalendarViewContextValue {
  const ctx = useContext(CalendarViewContext);
  if (!ctx) {
    throw new Error("useCalendarView must be used within a CalendarViewProvider");
  }
  return ctx;
}
