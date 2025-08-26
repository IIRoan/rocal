export type EventColor = "blue" | "orange" | "violet" | "rose" | "emerald" | string;
export interface Calendar {
    id: string;
    name: string;
    color: EventColor;
    isVisible: boolean;
    isDefault: boolean;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface CalendarEvent {
    id: string;
    title: string;
    description?: string | null;
    start: Date;
    end: Date;
    allDay?: boolean;
    location?: string | null;
    color?: string | null;
    calendarId: string;
    calendar?: Calendar | null;
    categoryId?: string | null;
    category?: EventCategory | null;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
    reminder?: number | null;
    recurrence?: string | null;
    parentEventId?: string | null;
    isRecurringInstance?: boolean;
    isSynced?: boolean;
    externalId?: string | null;
    subscriptionId?: string | null;
    syncedAt?: Date | null;
}
export interface EventCategory {
    id: string;
    name: string;
    color: string;
    isActive: boolean;
    userId: string;
    usageCount?: number;
    createdAt: Date;
    updatedAt: Date;
}
export interface EventsResponse {
    events: CalendarEvent[];
    categories: EventCategory[];
    calendars: Calendar[];
}
export interface CalendarsResponse {
    calendars: Calendar[];
}
export interface CategoriesResponse {
    categories: EventCategory[];
}
export interface CreateEventRequest {
    title: string;
    description?: string;
    start: string;
    end: string;
    allDay?: boolean;
    location?: string;
    color?: EventColor;
    calendarId: string;
    categoryId?: string;
    reminder?: number;
    recurrence?: string;
}
export interface CreateCalendarRequest {
    name: string;
    color: EventColor;
    isDefault?: boolean;
}
export interface UpdateCalendarRequest extends Partial<CreateCalendarRequest> {
    isVisible?: boolean;
}
export interface UpdateEventRequest extends Partial<CreateEventRequest> {
    id?: string;
}
export interface CreateCategoryRequest {
    name: string;
    color: EventColor;
}
export interface UpdateCategoryRequest extends Partial<CreateCategoryRequest> {
    id?: string;
}
export interface DeleteResponse {
    success: boolean;
    message: string;
    deletedEventId?: string;
}
export interface ApiError {
    error: string;
    message: string;
    statusCode: number;
    details?: unknown;
}
export interface UserSettings {
    id: string;
    userId: string;
    theme: "light" | "dark" | "system";
    defaultView: "month" | "week" | "day" | "agenda";
    weekStartDay: number;
    timezone: string;
    timeFormat: "12h" | "24h";
    workingHoursStart: number;
    workingHoursEnd: number;
    workingDays: string;
    emailNotifications: boolean;
    browserNotifications: boolean;
    reminderSound: boolean;
    defaultReminder?: number | null;
    defaultEventDuration: number;
    defaultCalendarId?: string | null;
    compactView: boolean;
    showWeekNumbers: boolean;
    showDeclinedEvents: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export interface UpdateSettingsRequest extends Partial<Omit<UserSettings, "id" | "userId" | "createdAt" | "updatedAt">> {
    userId?: string;
}
export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";
export interface RecurrenceRule {
    frequency: RecurrenceFrequency;
    interval: number;
    count?: number;
    until?: string;
    byWeekDay?: number[];
    byMonthDay?: number[];
    byMonth?: number[];
}
export interface RecurrencePreview {
    instances: Array<{
        date: string;
        isOriginal: boolean;
    }>;
    description: string;
    totalInstances: number;
}
export interface RecurrenceValidation {
    valid: boolean;
    errors: string[];
    description?: string;
    rule?: RecurrenceRule;
}
export interface RecurrencePatterns {
    [key: string]: {
        rule: RecurrenceRule;
        description: string;
    };
}
export type RecurrenceEditScope = "this_only" | "this_and_future" | "all";
export type RecurrenceDeleteScope = "this_only" | "this_and_future" | "all";
export interface EditRecurringEventRequest {
    editScope: RecurrenceEditScope;
    occurrenceDate?: string;
    updates: UpdateEventRequest;
}
export interface DeleteRecurringEventRequest {
    deleteScope: RecurrenceDeleteScope;
    occurrenceDate?: string;
}
export type CalendarDeleteAction = "delete_events" | "move_events";
export interface DeleteCalendarRequest {
    action?: CalendarDeleteAction;
    targetCalendarId?: string;
}
export interface CalendarDeleteResponse {
    success: boolean;
    message: string;
    deletedCalendarId: string;
    eventsAffected: number;
    action: string;
}
export type BulkEventAction = "move" | "delete" | "duplicate";
export interface BulkEventRequest {
    action: BulkEventAction;
    eventIds: string[];
    targetCalendarId?: string;
}
export interface BulkEventResponse {
    success: boolean;
    message: string;
    eventsProcessed: number;
    action: string;
    createdEvents?: CalendarEvent[];
}
export interface EventNotification {
    id?: string;
    eventId?: string;
    notificationType: "browser" | "email";
    minutesBefore: number;
    isEnabled: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}
export interface CreateNotificationRequest {
    notifications: Array<{
        notificationType: "browser" | "email";
        minutesBefore: number;
        isEnabled: boolean;
    }>;
}
export interface NotificationTestRequest {
    eventId: string;
}
export interface NotificationStatus {
    status: string;
    message: string;
    features: {
        email: boolean;
        browser: boolean;
        reminders: boolean;
    };
    checkInterval: string;
    queueProcessInterval: string;
}
//# sourceMappingURL=calendar.d.ts.map