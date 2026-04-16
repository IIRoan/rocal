import type {
  CalendarShareLinkResponse,
  CalendarKind,
  CreateCalendarShareLinkRequest,
  CalendarSubscriptionSummary,
  CalendarSubscriptionSyncResponse,
  CreateCalendarSubscriptionRequest,
  DisableCalendarShareLinkResponse,
  DeleteCalendarSubscriptionResponse,
  ImportIcsRequest,
  ImportIcsResponse,
  UpdateCalendarSubscriptionRequest,
} from "@workspace/calendar-ics";
import type { RecurrenceRule as SharedRecurrenceRule } from "@workspace/calendar-ics/recurrence";
import type { CalendarView } from "@workspace/ui/components/calendar";

// Event Search Types
export interface EventSearchResult {
  events: CalendarEvent[];
  total: number;
}

export interface EventSearchParams {
  q: string;
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
}

// Calendar API types matching backend structure

export type EventColor =
  | "blue"
  | "orange"
  | "violet"
  | "rose"
  | "emerald"
  | string;

export interface Calendar {
  id: string;
  name: string;
  color: EventColor;
  kind: CalendarKind;
  isPublic: boolean;
  isVisible: boolean;
  isDefault: boolean;
  isSyncOnly: boolean;
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
  timezone?: string | null;
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
  // New fields for enhanced functionality
  reminder?: number | null; // minutes before event
  recurrence?: string | null; // JSON string of recurrence rule
  parentEventId?: string | null; // For recurring event instances
  isRecurringInstance?: boolean; // Frontend helper field
  // Sync fields for external calendar events
  isSynced?: boolean; // Whether this event came from external calendar
  externalId?: string | null; // UID from the .ics file
  subscriptionId?: string | null; // Which subscription this event came from
  syncedAt?: Date | null; // When this event was last synced
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

// API Request/Response types
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
  start: string; // ISO date string
  end: string; // ISO date string
  timezone?: string;
  allDay?: boolean;
  location?: string;
  color?: EventColor;
  calendarId: string;
  categoryId?: string;
  reminder?: number; // minutes before event
  recurrence?: string; // JSON string of recurrence rule
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

// Error response type
export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  details?: unknown;
}

// User Settings Types
export interface UserSettings {
  id: string;
  userId: string;
  theme: "light" | "dark" | "system";
  defaultView: CalendarView;
  weekStartDay: number; // 0 = Sunday, 1 = Monday
  timezone: string; // IANA timezone identifier
  timeFormat: "12h" | "24h";
  workingHoursStart: number; // minutes from midnight
  workingHoursEnd: number; // minutes from midnight
  workingDays: string; // JSON array of weekdays
  emailNotifications: boolean;
  browserNotifications: boolean;
  reminderSound: boolean;
  defaultReminder?: number | null; // default reminder in minutes
  defaultEventDuration: number; // default event duration in minutes
  defaultCalendarId?: string | null;
  compactView: boolean;
  showWeekNumbers: boolean;
  showDeclinedEvents: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateSettingsRequest extends Partial<
  Omit<UserSettings, "id" | "userId" | "createdAt" | "updatedAt">
> {
  userId?: string;
}

// Recurring Events Types
export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export type RecurrenceRule = SharedRecurrenceRule;

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

// Recurring Event Operations
export type RecurrenceEditScope = "this_only" | "this_and_future" | "all";
export type RecurrenceDeleteScope = "this_only" | "this_and_future" | "all";

export interface EditRecurringEventRequest {
  editScope: RecurrenceEditScope;
  occurrenceDate?: string; // ISO date string
  updates: UpdateEventRequest;
}

export interface DeleteRecurringEventRequest {
  deleteScope: RecurrenceDeleteScope;
  occurrenceDate?: string; // ISO date string
}

// Calendar Deletion Types
export type CalendarDeleteAction = "delete_events" | "move_events";

export interface DeleteCalendarRequest {
  action?: CalendarDeleteAction;
  targetCalendarId?: string; // required if action is move_events
}

export interface CalendarDeleteResponse {
  success: boolean;
  message: string;
  deletedCalendarId: string;
  eventsAffected: number;
  action: string;
}

// Bulk Operations Types
export type BulkEventAction = "move" | "delete" | "duplicate";

export interface BulkEventRequest {
  action: BulkEventAction;
  eventIds: string[];
  targetCalendarId?: string; // required for move, optional for duplicate
}

export interface BulkEventResponse {
  success: boolean;
  message: string;
  eventsProcessed: number;
  action: string;
  createdEvents?: CalendarEvent[]; // for duplicate action
}

// Event Notification Types
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

// ICS and Subscription API Types (shared with backend)
export type CalendarSubscription = CalendarSubscriptionSummary;
export type CreateSubscriptionRequest = CreateCalendarSubscriptionRequest;
export type UpdateSubscriptionRequest = UpdateCalendarSubscriptionRequest;
export type DeleteSubscriptionResponse = DeleteCalendarSubscriptionResponse;
export type SyncSubscriptionResponse = CalendarSubscriptionSyncResponse;
export type ImportICSRequest = ImportIcsRequest;
export type ImportICSResponse = ImportIcsResponse;
export type CalendarShareLink = CalendarShareLinkResponse;
export type CreateCalendarShareLinkRequestPayload =
  CreateCalendarShareLinkRequest;
export type DisableCalendarShareLinkResponsePayload =
  DisableCalendarShareLinkResponse;
