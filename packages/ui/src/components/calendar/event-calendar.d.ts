import { CalendarEvent, CalendarView } from "./types";
import { EventNotification } from "./notification-manager";
export interface EventCalendarProps {
    className?: string;
    initialView?: CalendarView;
    events?: CalendarEvent[];
    categories?: any[];
    loading?: boolean;
    eventsLoading?: boolean;
    error?: any;
    onCreateEvent?: (event: any) => Promise<any>;
    onUpdateEvent?: (id: string, event: any) => Promise<any>;
    onDeleteEvent?: (id: string) => Promise<void>;
    onCreateCategory?: (category: any) => Promise<any>;
    onDateRangeChange?: (dateRange: {
        start: Date;
        end: Date;
    }) => void;
    showWeekNumbers?: boolean;
    compactView?: boolean;
    timeFormat?: "12h" | "24h";
    defaultReminder?: number | null;
    defaultEventDuration?: number;
    defaultCalendarId?: string | null;
    weekStartDay?: number;
    workingDays?: number[];
    timezone?: string;
    themeSettings?: {
        currentTheme: "light" | "dark" | "system";
        updateTheme: (theme: "light" | "dark" | "system") => Promise<void>;
    };
    onLoadNotifications?: (eventId: string) => Promise<EventNotification[]>;
    onUpdateNotifications?: (eventId: string, notifications: EventNotification[]) => Promise<void>;
    onEventEdit?: (event: CalendarEvent) => void;
    hideSidebarTrigger?: boolean;
    onSidebarToggle?: () => void;
}
export declare function EventCalendar({ className, initialView, events, categories, loading, eventsLoading, error, onCreateEvent, onUpdateEvent, onDeleteEvent, onCreateCategory, onDateRangeChange, showWeekNumbers, compactView, timeFormat, defaultReminder, defaultEventDuration, defaultCalendarId, weekStartDay, workingDays, timezone, themeSettings, onLoadNotifications, onUpdateNotifications, onEventEdit, hideSidebarTrigger, onSidebarToggle, }: EventCalendarProps): import("react").JSX.Element;
//# sourceMappingURL=event-calendar.d.ts.map