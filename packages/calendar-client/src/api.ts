import { httpClient, HttpClient } from "./http-client";
import type {
  ApiError,
  BulkEventRequest,
  BulkEventResponse,
  Calendar,
  CalendarDeleteResponse,
  CalendarEvent,
  CalendarsResponse,
  CategoriesResponse,
  CreateCalendarRequest,
  CreateCategoryRequest,
  CreateEventRequest,
  CreateNotificationRequest,
  DeleteResponse,
  EditRecurringEventRequest,
  EventCategory,
  EventNotification,
  EventsResponse,
  NotificationStatus,
  RecurrencePatterns,
  RecurrencePreview,
  RecurrenceValidation,
  UpdateCalendarRequest,
  UpdateCategoryRequest,
  UpdateEventRequest,
  UpdateSettingsRequest,
  UserSettings,
} from "./types";

export class CalendarApiService {
  private client: HttpClient;

  constructor(client?: HttpClient) {
    this.client = client || httpClient;
  }

  async getEvents(
    start: Date,
    end: Date,
    signal?: AbortSignal,
  ): Promise<EventsResponse> {
    try {
      const startISO = start.toISOString();
      const endISO = end.toISOString();

      const doFetch = async (): Promise<EventsResponse> =>
        await this.client.get<EventsResponse>(
          `/api/events?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`,
          { signal },
        );

      let response = await doFetch();

      const isComplete = (res: EventsResponse) => {
        if (!res || !Array.isArray(res.events)) return false;
        return res.events.every(
          (e) => e && e.start instanceof Date && e.end instanceof Date,
        );
      };

      if (!isComplete(response)) {
        await new Promise((r) => setTimeout(r, 150));
        response = await doFetch();
        if (!isComplete(response)) {
          throw {
            error: "Incomplete Data",
            message:
              "Event data appears incomplete. Please try again in a moment.",
            statusCode: 502,
            details: { reason: "validation_failed" },
          };
        }
      }

      return response;
    } catch (error) {
      throw this.transformError(error, "Failed to fetch events");
    }
  }

  async getEvent(id: string): Promise<CalendarEvent> {
    try {
      return await this.client.get<CalendarEvent>(`/api/events/${id}`);
    } catch (error) {
      throw this.transformError(error, "Failed to fetch event");
    }
  }

  async createEvent(event: CreateEventRequest): Promise<CalendarEvent> {
    try {
      return await this.client.post<CalendarEvent>("/api/events", event);
    } catch (error) {
      throw this.transformError(error, "Failed to create event");
    }
  }

  async updateEvent(
    id: string,
    event: UpdateEventRequest,
  ): Promise<CalendarEvent> {
    try {
      return await this.client.put<CalendarEvent>(`/api/events/${id}`, event);
    } catch (error) {
      throw this.transformError(error, "Failed to update event");
    }
  }

  async deleteEvent(id: string): Promise<DeleteResponse> {
    try {
      return await this.client.delete<DeleteResponse>(`/api/events/${id}`);
    } catch (error) {
      throw this.transformError(error, "Failed to delete event");
    }
  }

  async getCalendars(): Promise<Calendar[]> {
    try {
      const response = await this.client.get<CalendarsResponse>("/api/calendars");
      return response.calendars;
    } catch (error) {
      throw this.transformError(error, "Failed to fetch calendars");
    }
  }

  async createCalendar(calendar: CreateCalendarRequest): Promise<Calendar> {
    try {
      return await this.client.post<Calendar>("/api/calendars", calendar);
    } catch (error) {
      throw this.transformError(error, "Failed to create calendar");
    }
  }

  async updateCalendar(
    id: string,
    calendar: UpdateCalendarRequest,
  ): Promise<Calendar> {
    try {
      return await this.client.put<Calendar>(`/api/calendars/${id}`, calendar);
    } catch (error) {
      throw this.transformError(error, "Failed to update calendar");
    }
  }

  async deleteCalendar(id: string): Promise<DeleteResponse> {
    try {
      return await this.client.delete<DeleteResponse>(`/api/calendars/${id}`);
    } catch (error) {
      throw this.transformError(error, "Failed to delete calendar");
    }
  }

  async getCategories(): Promise<EventCategory[]> {
    try {
      const response = await this.client.get<CategoriesResponse>("/api/categories");
      return response.categories;
    } catch (error) {
      throw this.transformError(error, "Failed to fetch categories");
    }
  }

  async createCategory(
    category: CreateCategoryRequest,
  ): Promise<EventCategory> {
    try {
      return await this.client.post<EventCategory>("/api/categories", category);
    } catch (error) {
      throw this.transformError(error, "Failed to create category");
    }
  }

  async updateCategory(
    id: string,
    category: UpdateCategoryRequest,
  ): Promise<EventCategory> {
    try {
      return await this.client.put<EventCategory>(`/api/categories/${id}`, category);
    } catch (error) {
      throw this.transformError(error, "Failed to update category");
    }
  }

  async deleteCategory(id: string): Promise<DeleteResponse> {
    try {
      return await this.client.delete<DeleteResponse>(`/api/categories/${id}`);
    } catch (error) {
      throw this.transformError(error, "Failed to delete category");
    }
  }

  private transformError(error: any, defaultMessage: string): ApiError {
    if (error.statusCode && error.error && error.message) {
      return error as ApiError;
    }

    if (error.name === "TypeError" || error.name === "AbortError") {
      return {
        error: "Network Error",
        message:
          "Unable to connect to the server. Please check your internet connection.",
        statusCode: 0,
      };
    }

    if (error.name === "AbortError") {
      return {
        error: "Timeout Error",
        message: "The request took too long to complete. Please try again.",
        statusCode: 0,
      };
    }

    return {
      error: "Unknown Error",
      message: error.message || defaultMessage,
      statusCode: error.status || 500,
    };
  }

  static dateToISO(date: Date): string {
    return date.toISOString();
  }

  static validateEventData(
    event: CreateEventRequest | UpdateEventRequest,
  ): string[] {
    const errors: string[] = [];

    if ("title" in event && (!event.title || !event.title.trim())) {
      errors.push("Title is required");
    }

    if ("calendarId" in event && !event.calendarId) {
      errors.push("Calendar is required");
    }

    if ("title" in event && event.title && event.title.length > 255) {
      errors.push("Title cannot exceed 255 characters");
    }

    if (
      "description" in event &&
      event.description &&
      event.description.length > 1000
    ) {
      errors.push("Description cannot exceed 1000 characters");
    }

    if ("location" in event && event.location && event.location.length > 255) {
      errors.push("Location cannot exceed 255 characters");
    }

    if ("start" in event && "end" in event && event.start && event.end) {
      const startDate = new Date(event.start);
      const endDate = new Date(event.end);

      if (startDate >= endDate) {
        errors.push("End time must be after start time");
      }
    }

    if ("color" in event && event.color) {
      const allowedColors = ["blue", "orange", "violet", "rose", "emerald"];
      if (!allowedColors.includes(event.color)) {
        errors.push(`Color must be one of: ${allowedColors.join(", ")}`);
      }
    }

    return errors;
  }

  static validateCategoryData(
    category: CreateCategoryRequest | UpdateCategoryRequest,
  ): string[] {
    const errors: string[] = [];

    if ("name" in category && (!category.name || !category.name.trim())) {
      errors.push("Category name is required");
    }

    if ("color" in category && category.color) {
      const allowedColors = ["blue", "orange", "violet", "rose", "emerald"];
      if (!allowedColors.includes(category.color)) {
        errors.push(`Color must be one of: ${allowedColors.join(", ")}`);
      }
    }

    return errors;
  }

  async getUserSettings(): Promise<UserSettings> {
    try {
      return await this.client.get<UserSettings>("/api/settings");
    } catch (error) {
      throw this.transformError(error, "Failed to fetch user settings");
    }
  }

  async updateUserSettings(
    settings: UpdateSettingsRequest,
  ): Promise<UserSettings> {
    try {
      return await this.client.put<UserSettings>("/api/settings", settings);
    } catch (error) {
      throw this.transformError(error, "Failed to update user settings");
    }
  }

  async resetUserSettings(): Promise<{ success: boolean; message: string }> {
    try {
      return await this.client.delete<{ success: boolean; message: string }>(
        "/api/settings",
      );
    } catch (error) {
      throw this.transformError(error, "Failed to reset user settings");
    }
  }

  async validateRecurrence(
    rule: string | object,
  ): Promise<RecurrenceValidation> {
    try {
      return await this.client.post<RecurrenceValidation>(
        "/api/recurring/validate",
        { rule },
      );
    } catch (error) {
      throw this.transformError(error, "Failed to validate recurrence rule");
    }
  }

  async previewRecurrence(
    eventStart: string,
    eventEnd: string,
    recurrenceRule: string | object,
    previewDays?: number,
  ): Promise<RecurrencePreview> {
    try {
      return await this.client.post<RecurrencePreview>(
        "/api/recurring/preview",
        {
          eventStart,
          eventEnd,
          recurrenceRule,
          previewDays,
        },
      );
    } catch (error) {
      throw this.transformError(error, "Failed to generate recurrence preview");
    }
  }

  async getRecurrencePatterns(): Promise<RecurrencePatterns> {
    try {
      const response = await this.client.get<{ patterns: RecurrencePatterns }>(
        "/api/recurring/patterns",
      );
      return response.patterns;
    } catch (error) {
      throw this.transformError(error, "Failed to fetch recurrence patterns");
    }
  }

  async editRecurringEvent(
    id: string,
    request: EditRecurringEventRequest,
  ): Promise<CalendarEvent> {
    try {
      return await this.client.put<CalendarEvent>(`/api/recurring/event/${id}`, request);
    } catch (error) {
      throw this.transformError(error, "Failed to edit recurring event");
    }
  }

  async deleteRecurringEvent(
    id: string,
    deleteScope: string,
    occurrenceDate?: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const params = new URLSearchParams({ deleteScope });
      if (occurrenceDate) params.append("occurrenceDate", occurrenceDate);

      return await this.client.delete<{ success: boolean; message: string }>(
        `/api/recurring/event/${id}?${params}`,
      );
    } catch (error) {
      throw this.transformError(error, "Failed to delete recurring event");
    }
  }

  async deleteCalendarAdvanced(
    id: string,
    action?: string,
    targetCalendarId?: string,
  ): Promise<CalendarDeleteResponse> {
    try {
      const params = new URLSearchParams();
      if (action) params.append("action", action);
      if (targetCalendarId) params.append("targetCalendarId", targetCalendarId);

      return await this.client.delete<CalendarDeleteResponse>(
        `/api/calendars/${id}?${params}`,
      );
    } catch (error) {
      throw this.transformError(error, "Failed to delete calendar");
    }
  }

  async importICS(request: {
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
  }> {
    try {
      return await this.client.post<{
        success: boolean;
        eventsCreated: number;
        eventsTotal: number;
        fileName?: string;
        calendarName?: string;
        errors?: string[];
      }>("/api/subscriptions/import-ics", request);
    } catch (error) {
      throw this.transformError(error, "Failed to import ICS file");
    }
  }

  async getSubscriptions(): Promise<any[]> {
    try {
      return await this.client.get<any[]>("/api/subscriptions");
    } catch (error) {
      throw this.transformError(error, "Failed to load subscriptions");
    }
  }

  async createSubscription(request: {
    name?: string;
    url: string;
    calendarId: string;
  }): Promise<any> {
    try {
      return await this.client.post<any>("/api/subscriptions", request);
    } catch (error) {
      throw this.transformError(error, "Failed to create subscription");
    }
  }

  async updateSubscription(
    id: string,
    request: {
      name?: string;
      isActive?: boolean;
      syncIntervalMinutes?: number;
    },
  ): Promise<any> {
    try {
      return await this.client.put<any>(`/api/subscriptions/${id}`, request);
    } catch (error) {
      throw this.transformError(error, "Failed to update subscription");
    }
  }

  async deleteSubscription(
    id: string,
    deleteEvents = false,
  ): Promise<{ success: boolean }> {
    try {
      const params = new URLSearchParams();
      if (deleteEvents) params.append("deleteEvents", "true");

      return await this.client.delete<{ success: boolean }>(
        `/api/subscriptions/${id}?${params}`,
      );
    } catch (error) {
      throw this.transformError(error, "Failed to delete subscription");
    }
  }

  async syncSubscription(id: string): Promise<{
    status: string;
    eventsAdded?: number;
    eventsUpdated?: number;
    eventsDeleted?: number;
    errors?: string[];
  }> {
    try {
      return await this.client.post<{
        status: string;
        eventsAdded?: number;
        eventsUpdated?: number;
        eventsDeleted?: number;
        errors?: string[];
      }>(`/api/subscriptions/${id}/sync`, {});
    } catch (error) {
      throw this.transformError(error, "Failed to sync subscription");
    }
  }

  async bulkEventOperation(
    request: BulkEventRequest,
  ): Promise<BulkEventResponse> {
    try {
      return await this.client.post<BulkEventResponse>("/api/events/bulk", request);
    } catch (error) {
      throw this.transformError(error, "Failed to perform bulk event operation");
    }
  }

  async triggerReminderCheck(): Promise<{ success: boolean; message: string }> {
    try {
      return await this.client.post<{ success: boolean; message: string }>(
        "/api/notifications/trigger-check",
        {},
      );
    } catch (error) {
      throw this.transformError(error, "Failed to trigger reminder check");
    }
  }

  async getNotificationStatus(): Promise<NotificationStatus> {
    try {
      return await this.client.get<NotificationStatus>("/api/notifications/status");
    } catch (error) {
      throw this.transformError(error, "Failed to get notification status");
    }
  }

  async getEventNotifications(eventId: string): Promise<{
    success: boolean;
    data: {
      eventId: string;
      notifications: EventNotification[];
      count: number;
    };
  }> {
    try {
      return await this.client.get<{
        success: boolean;
        data: {
          eventId: string;
          notifications: EventNotification[];
          count: number;
        };
      }>(`/api/notifications/event/${eventId}`);
    } catch (error) {
      throw this.transformError(error, "Failed to get event notifications");
    }
  }

  async updateEventNotifications(
    eventId: string,
    notifications: CreateNotificationRequest["notifications"],
  ): Promise<{ success: boolean; message: string }> {
    try {
      return await this.client.put<{ success: boolean; message: string }>(
        `/api/notifications/event/${eventId}`,
        { notifications },
      );
    } catch (error) {
      throw this.transformError(error, "Failed to update event notifications");
    }
  }

  async createMultipleNotifications(
    eventId: string,
    notificationTimes: number[],
  ): Promise<{
    success: boolean;
    message: string;
    notificationTimes: number[];
  }> {
    try {
      return await this.client.post<{
        success: boolean;
        message: string;
        notificationTimes: number[];
      }>(`/api/notifications/event/${eventId}/multiple`, { notificationTimes });
    } catch (error) {
      throw this.transformError(error, "Failed to create multiple notifications");
    }
  }
}

export const calendarApiService = new CalendarApiService();
