"use client";
import { createContext, useContext } from "react";
import { useCalendarData, } from "@/hooks/use-calendar-data";
const CalendarDataContext = createContext(undefined);
export function useSharedCalendarData() {
    const context = useContext(CalendarDataContext);
    if (!context) {
        throw new Error("useSharedCalendarData must be used within a CalendarDataProvider");
    }
    return context;
}
export function CalendarDataProvider({ children }) {
    const calendarData = useCalendarData({
        autoRefetch: true,
        cacheTimeout: 10 * 60 * 1000, // 10 minutes cache
    });
    // Don't memoize the entire object, just pass it directly
    // The hook already handles internal memoization
    return (<CalendarDataContext.Provider value={calendarData}>
      {children}
    </CalendarDataContext.Provider>);
}
