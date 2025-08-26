import React, { ReactNode } from "react";
import { Calendar, CreateCalendarData } from "./types";
interface CalendarContextType {
    currentDate: Date;
    setCurrentDate: (date: Date) => void;
    clearSavedDate: () => void;
    calendars: Calendar[];
    setCalendars: (calendars: Calendar[]) => void;
    addCalendar: (calendarData: CreateCalendarData) => Promise<void>;
    toggleCalendarVisibility: (calendarId: string) => Promise<void>;
    isCalendarVisible: (calendarId: string) => boolean;
    getVisibleCalendars: () => Calendar[];
    refreshCalendars: () => Promise<void>;
    visibleColors: string[];
    toggleColorVisibility: (color: string) => void;
    isColorVisible: (color: string | undefined) => boolean;
}
export declare function useCalendarContext(): CalendarContextType;
interface CalendarProviderProps {
    children: ReactNode;
    initialCalendars?: Calendar[];
    onCreateCalendar?: (calendarData: CreateCalendarData) => Promise<Calendar>;
    onUpdateCalendar?: (id: string, updates: Partial<Calendar>) => Promise<Calendar>;
    onRefreshCalendars?: () => Promise<Calendar[]>;
}
export declare function CalendarProvider({ children, initialCalendars, onCreateCalendar, onUpdateCalendar, onRefreshCalendars, }: CalendarProviderProps): React.JSX.Element;
export {};
//# sourceMappingURL=calendar-context.d.ts.map