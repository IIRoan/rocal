import type { PaletteView } from "./constants";
export declare const validateCalendarForm: (calendarName: string, calendarColor: string, calendars: any[], editingCalendar?: any) => {
    name?: string;
    color?: string;
};
export declare const handleCalendarCreate: (calendarName: string, calendarColor: string, calendars: any[], calendarData: any, setters: {
    setCalendarValidationErrors: (errors: any) => void;
    setCalendarSaving: (saving: boolean) => void;
    setCalendarName: (name: string) => void;
    setCalendarColor: (color: string) => void;
}, goBack: (view: PaletteView) => void) => Promise<void>;
export declare const handleCalendarUpdate: (calendarName: string, calendarColor: string, calendars: any[], editingCalendar: any, calendarData: any, setters: {
    setCalendarValidationErrors: (errors: any) => void;
    setCalendarSaving: (saving: boolean) => void;
    setEditingCalendar: (calendar: any) => void;
}, goBack: (view: PaletteView) => void) => Promise<void>;
export declare const handleCalendarDelete: (calendar: any, calendarData: any, setCalendarSaving: (saving: boolean) => void, goBack: (view: PaletteView) => void) => Promise<void>;
export declare const resetCalendarForm: (setters: {
    setCalendarName: (name: string) => void;
    setCalendarColor: (color: string) => void;
    setEditingCalendar: (calendar: any) => void;
    setCalendarValidationErrors: (errors: any) => void;
}) => void;
//# sourceMappingURL=calendar-utils.d.ts.map