import { HttpClient } from "./http-client";
import { CalendarEvent, Calendar, EventCategory, EventsResponse, CreateEventRequest, UpdateEventRequest, CreateCalendarRequest, UpdateCalendarRequest, CreateCategoryRequest, UpdateCategoryRequest, DeleteResponse, UserSettings, UpdateSettingsRequest, RecurrenceValidation, RecurrencePreview, RecurrencePatterns, EditRecurringEventRequest, CalendarDeleteResponse, BulkEventRequest, BulkEventResponse, NotificationStatus, EventNotification, CreateNotificationRequest } from "./types/calendar";
export declare class CalendarApiService {
    private client;
    constructor(client?: HttpClient);
    getEvents(start: Date, end: Date, signal?: AbortSignal): Promise<EventsResponse>;
    createEvent(event: CreateEventRequest): Promise<CalendarEvent>;
    updateEvent(id: string, event: UpdateEventRequest): Promise<CalendarEvent>;
    deleteEvent(id: string): Promise<DeleteResponse>;
    getCalendars(): Promise<Calendar[]>;
    createCalendar(calendar: CreateCalendarRequest): Promise<Calendar>;
    updateCalendar(id: string, calendar: UpdateCalendarRequest): Promise<Calendar>;
    deleteCalendar(id: string): Promise<DeleteResponse>;
    getCategories(): Promise<EventCategory[]>;
    createCategory(category: CreateCategoryRequest): Promise<EventCategory>;
    updateCategory(id: string, category: UpdateCategoryRequest): Promise<EventCategory>;
    deleteCategory(id: string): Promise<DeleteResponse>;
    private transformError;
    static dateToISO(date: Date): string;
    static validateEventData(event: CreateEventRequest | UpdateEventRequest): string[];
    static validateCategoryData(category: CreateCategoryRequest | UpdateCategoryRequest): string[];
    getUserSettings(): Promise<UserSettings>;
    updateUserSettings(settings: UpdateSettingsRequest): Promise<UserSettings>;
    resetUserSettings(): Promise<{
        success: boolean;
        message: string;
    }>;
    validateRecurrence(rule: string | object): Promise<RecurrenceValidation>;
    previewRecurrence(eventStart: string, eventEnd: string, recurrenceRule: string | object, previewDays?: number): Promise<RecurrencePreview>;
    getRecurrencePatterns(): Promise<RecurrencePatterns>;
    editRecurringEvent(id: string, request: EditRecurringEventRequest): Promise<CalendarEvent>;
    deleteRecurringEvent(id: string, deleteScope: string, occurrenceDate?: string): Promise<{
        success: boolean;
        message: string;
    }>;
    deleteCalendarAdvanced(id: string, action?: string, targetCalendarId?: string): Promise<CalendarDeleteResponse>;
    importICS(request: {
        calendarId: string;
        icsContent: string;
        fileName?: string;
    }): Promise<{
        success: boolean;
        eventsCreated: number;
        eventsTotal: number;
        fileName?: string;
        calendarName?: string;
        errors?: string[];
    }>;
    getSubscriptions(): Promise<any[]>;
    createSubscription(request: {
        name?: string;
        url: string;
        calendarId: string;
    }): Promise<any>;
    updateSubscription(id: string, request: {
        name?: string;
        isActive?: boolean;
        syncIntervalMinutes?: number;
    }): Promise<any>;
    deleteSubscription(id: string, deleteEvents?: boolean): Promise<{
        success: boolean;
    }>;
    syncSubscription(id: string): Promise<{
        status: string;
        eventsAdded?: number;
        eventsUpdated?: number;
        eventsDeleted?: number;
        errors?: string[];
    }>;
    bulkEventOperation(request: BulkEventRequest): Promise<BulkEventResponse>;
    triggerReminderCheck(): Promise<{
        success: boolean;
        message: string;
    }>;
    getNotificationStatus(): Promise<NotificationStatus>;
    getEventNotifications(eventId: string): Promise<{
        success: boolean;
        data: {
            eventId: string;
            notifications: EventNotification[];
            count: number;
        };
    }>;
    updateEventNotifications(eventId: string, notifications: CreateNotificationRequest["notifications"]): Promise<{
        success: boolean;
        message: string;
    }>;
    createMultipleNotifications(eventId: string, notificationTimes: number[]): Promise<{
        success: boolean;
        message: string;
        notificationTimes: number[];
    }>;
}
export declare const calendarApiService: CalendarApiService;
//# sourceMappingURL=calendar-api-service.d.ts.map