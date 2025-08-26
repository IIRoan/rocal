import { CalendarEvent, Calendar, EventCategory, CreateEventRequest, UpdateEventRequest, CreateCalendarRequest, UpdateCalendarRequest, CreateCategoryRequest, UpdateCategoryRequest, ApiError } from "../lib/types/calendar";
import { EventNotification } from "@workspace/ui/components/calendar/notification-manager";
interface DateRange {
    start: Date;
    end: Date;
}
interface UseCalendarDataOptions {
    initialDateRange?: DateRange;
    cacheTimeout?: number;
    autoRefetch?: boolean;
}
export interface UseCalendarDataReturn {
    events: CalendarEvent[];
    calendars: Calendar[];
    categories: EventCategory[];
    loading: boolean;
    eventsLoading: boolean;
    calendarsLoading: boolean;
    categoriesLoading: boolean;
    error: ApiError | null;
    eventsError: ApiError | null;
    calendarsError: ApiError | null;
    categoriesError: ApiError | null;
    refetch: () => Promise<void>;
    refetchEvents: (dateRange?: DateRange) => Promise<void>;
    refetchCalendars: () => Promise<Calendar[]>;
    refetchCategories: () => Promise<void>;
    createEvent: (event: CreateEventRequest) => Promise<CalendarEvent>;
    updateEvent: (id: string, event: UpdateEventRequest) => Promise<CalendarEvent>;
    deleteEvent: (id: string) => Promise<void>;
    createCalendar: (calendar: CreateCalendarRequest) => Promise<Calendar>;
    updateCalendar: (id: string, calendar: UpdateCalendarRequest) => Promise<Calendar>;
    deleteCalendar: (id: string) => Promise<void>;
    createCategory: (category: CreateCategoryRequest) => Promise<EventCategory>;
    updateCategory: (id: string, category: UpdateCategoryRequest) => Promise<EventCategory>;
    deleteCategory: (id: string) => Promise<void>;
    setDateRange: (dateRange: DateRange) => void;
    clearCache: () => void;
    loadNotifications: (eventId: string) => Promise<EventNotification[]>;
    updateNotifications: (eventId: string, notifications: EventNotification[]) => Promise<void>;
}
export declare function useCalendarData(options?: UseCalendarDataOptions): UseCalendarDataReturn;
export {};
//# sourceMappingURL=use-calendar-data.d.ts.map