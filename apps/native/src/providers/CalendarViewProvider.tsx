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
  setActiveView: (view: DetailCalendarView) => void;
}

const CalendarViewContext = createContext<CalendarViewContextValue | null>(null);

export function CalendarViewProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [activeView, setActiveViewState] = useState<DetailCalendarView>("day");

  const setActiveView = useCallback((view: DetailCalendarView) => {
    setActiveViewState(view);
  }, []);

  const value = useMemo<CalendarViewContextValue>(
    () => ({ activeView, setActiveView }),
    [activeView, setActiveView],
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
