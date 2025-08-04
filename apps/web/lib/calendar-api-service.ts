import { httpClient, HttpClient } from "./http-client";
import {
  CalendarEvent,
  Calendar,
  EventCategory,
  EventsResponse,
  CalendarsResponse,
  CategoriesResponse,
  CreateEventRequest,
  UpdateEventRequest,
  CreateCalendarRequest,
  UpdateCalendarRequest,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  DeleteResponse,
  ApiError,
  UserSettings,
  UpdateSettingsRequest,
  RecurrenceValidation,
  RecurrencePreview,
  RecurrencePatterns,
  EditRecurringEventRequest,
  DeleteRecurringEventRequest,
  CalendarDeleteResponse,
  BulkEventRequest,
  BulkEventResponse,
  NotificationStatus,
  EventNotification,
  CreateNotificationRequest,
} from "./types/calendar";
// Browser notifications removed

export class CalendarApiService {
  private client: HttpClient;

  constructor(client?: HttpClient) {
    this.client = client || httpClient;
  }

  // Events API methods
  async getEvents(start: Date, end: Date): Promise<EventsResponse> {
    try {
      const startISO = start.toISOString();
      const endISO = end.toISOString();

      const response = await this.client.get<EventsResponse>(
        `/api/events?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`,
      );

      return response;
    } catch (error) {
      throw this.transformError(error, "Failed to fetch events");
    }
  }

  async createEvent(event: CreateEventRequest): Promise<CalendarEvent> {
    try {
      const response = await this.client.post<CalendarEvent>(
        "/api/events",
        event,
      );
      return response;
    } catch (error) {
      throw this.transformError(error, "Failed to create event");
    }
  }

  async updateEvent(
    id: string,
    event: UpdateEventRequest,
  ): Promise<CalendarEvent> {
    try {
      const response = await this.client.put<CalendarEvent>(
        `/api/events/${id}`,
        event,
      );
      return response;
    } catch (error) {
      throw this.transformError(error, "Failed to update event");
    }
  }

  async deleteEvent(id: string): Promise<DeleteResponse> {
    try {
      const response = await this.client.delete<DeleteResponse>(
        `/api/events/${id}`,
      );
      return response;
    } catch (error) {
      throw this.transformError(error, "Failed to delete event");
    }
  }

  // Calendars API methods
  async getCalendars(): Promise<Calendar[]> {
    try {
      const response =
        await this.client.get<CalendarsResponse>("/api/calendars");
      return response.calendars;
    } catch (error) {
      throw this.transformError(error, "Failed to fetch calendars");
    }
  }

  async createCalendar(calendar: CreateCalendarRequest): Promise<Calendar> {
    try {
      const response = await this.client.post<Calendar>(
        "/api/calendars",
        calendar,
      );
      return response;
    } catch (error) {
      throw this.transformError(error, "Failed to create calendar");
    }
  }

  async updateCalendar(
    id: string,
    calendar: UpdateCalendarRequest,
  ): Promise<Calendar> {
    try {
      const response = await this.client.put<Calendar>(
        `/api/calendars/${id}`,
        calendar,
      );
      return response;
    } catch (error) {
      throw this.transformError(error, "Failed to update calendar");
    }
  }

  async deleteCalendar(id: string): Promise<DeleteResponse> {
    try {
      const response = await this.client.delete<DeleteResponse>(
        `/api/calendars/${id}`,
      );
      return response;
    } catch (error) {
      throw this.transformError(error, "Failed to delete calendar");
    }
  }

  // Categories API methods
  async getCategories(): Promise<EventCategory[]> {
    try {
      const response =
        await this.client.get<CategoriesResponse>("/api/categories");
      return response.categories;
    } catch (error) {
      throw this.transformError(error, "Failed to fetch categories");
    }
  }

  async createCategory(
    category: CreateCategoryRequest,
  ): Promise<EventCategory> {
    try {
      const response = await this.client.post<EventCategory>(
        "/api/categories",
        category,
      );
      return response;
    } catch (error) {
      throw this.transformError(error, "Failed to create category");
    }
  }

  async updateCategory(
    id: string,
    category: UpdateCategoryRequest,
  ): Promise<EventCategory> {
    try {
      const response = await this.client.put<EventCategory>(
        `/api/categories/${id}`,
        category,
      );
      return response;
    } catch (error) {
      throw this.transformError(error, "Failed to update category");
    }
  }

  async deleteCategory(id: string): Promise<DeleteResponse> {
    try {
      const response = await this.client.delete<DeleteResponse>(
        `/api/categories/${id}`,
      );
      return response;
    } catch (error) {
      throw this.transformError(error, "Failed to delete category");
    }
  }

  // Utility methods
  private transformError(error: any, defaultMessage: string): ApiError {
    // If it's already an ApiError from the HTTP client, return it
    if (error.statusCode && error.error && error.message) {
      return error as ApiError;
    }

    // Handle network errors
    if (error.name === "TypeError" || error.name === "AbortError") {
      return {
        error: "Network Error",
        message:
          "Unable to connect to the server. Please check your internet connection.",
        statusCode: 0,
      };
    }

    // Handle timeout errors
    if (error.name === "AbortError") {
      return {
        error: "Timeout Error",
        message: "The request took too long to complete. Please try again.",
        statusCode: 0,
      };
    }

    // Fallback for unknown errors
    return {
      error: "Unknown Error",
      message: error.message || defaultMessage,
      statusCode: error.status || 500,
    };
  }

  // Helper method to convert Date objects to ISO strings for API requests
  static dateToISO(date: Date): string {
    return date.toISOString();
  }

  // Helper method to validate event data before sending to API
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

  // Helper method to validate category data before sending to API
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

  // User Settings API methods
  async getUserSettings(): Promise<UserSettings> {
    try {
      const response = await this.client.get<UserSettings>("/api/settings");
      return response;
    } catch (error) {
      throw this.transformError(error, "Failed to fetch user settings");
    }
  }

  async updateUserSettings(
    settings: UpdateSettingsRequest,
  ): Promise<UserSettings> {
    try {
      const response = await this.client.put<UserSettings>(
        "/api/settings",
        settings,
      );
      return response;
    } catch (error) {
      throw this.transformError(error, "Failed to update user settings");
    }
  }

  async resetUserSettings(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.client.delete<{
        success: boolean;
        message: string;
      }>("/api/settings");
      return response;
    } catch (error) {
      throw this.transformError(error, "Failed to reset user settings");
    }
  }

  // Recurring Events API methods
  async validateRecurrence(
    rule: string | object,
  ): Promise<RecurrenceValidation> {
    try {
      const response = await this.client.post<RecurrenceValidation>(
        "/api/recurring/validate",
        { rule },
      );
      return response;
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
      const response = await this.client.post<RecurrencePreview>(
        "/api/recurring/preview",
        {
          eventStart,
          eventEnd,
          recurrenceRule,
          previewDays,
        },
      );
      return response;
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
      const response = await this.client.put<CalendarEvent>(
        `/api/recurring/event/${id}`,
        request,
      );
      return response;
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

      const response = await this.client.delete<{
        success: boolean;
        message: string;
      }>(`/api/recurring/event/${id}?${params}`);
      return response;
    } catch (error) {
      throw this.transformError(error, "Failed to delete recurring event");
    }
  }

  // Enhanced Calendar Deletion
  async deleteCalendarAdvanced(
    id: string,
    action?: string,
    targetCalendarId?: string,
  ): Promise<CalendarDeleteResponse> {
    try {
      const params = new URLSearchParams();
      if (action) params.append("action", action);
      if (targetCalendarId) params.append("targetCalendarId", targetCalendarId);

      const response = await this.client.delete<CalendarDeleteResponse>(
        `/api/calendars/${id}?${params}`,
      );
      return response;
    } catch (error) {
      throw this.transformError(error, "Failed to delete calendar");
    }
  }

  // Bulk Event Operations
  async bulkEventOperation(
    request: BulkEventRequest,
  ): Promise<BulkEventResponse> {
    try {
      const response = await this.client.post<BulkEventResponse>(
        "/api/events/bulk",
        request,
      );
      return response;
    } catch (error) {
      throw this.transformError(
        error,
        "Failed to perform bulk event operation",
      );
    }
  }

  // Notification API methods

  async triggerReminderCheck(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.client.post<{
        success: boolean;
        message: string;
      }>("/api/notifications/trigger-check", {});
      return response;
    } catch (error) {
      throw this.transformError(error, "Failed to trigger reminder check");
    }
  }

  async getNotificationStatus(): Promise<NotificationStatus> {
    try {
      const response = await this.client.get<NotificationStatus>(
        "/api/notifications/status",
      );
      return response;
    } catch (error) {
      throw this.transformError(error, "Failed to get notification status");
    }
  }

  async getEventNotifications(
    eventId: string,
  ): Promise<{ 
    success: boolean; 
    data: { 
      eventId: string; 
      notifications: EventNotification[]; 
      count: number; 
    } 
  }> {
    try {
      const response = await this.client.get<{
        success: boolean;
        data: {
          eventId: string;
          notifications: EventNotification[];
          count: number;
        };
      }>(`/api/notifications/event/${eventId}`);
      return response;
    } catch (error) {
      throw this.transformError(error, "Failed to get event notifications");
    }
  }

  async updateEventNotifications(
    eventId: string,
    notifications: CreateNotificationRequest["notifications"],
  ): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.client.put<{
        success: boolean;
        message: string;
      }>(`/api/notifications/event/${eventId}`, { notifications });
      return response;
    } catch (error) {
      throw this.transformError(error, "Failed to update event notifications");
    }
  }

  // Browser notification methods removed

  // New email notification methods

  async createMultipleNotifications(
    eventId: string,
    notificationTimes: number[],
  ): Promise<{
    success: boolean;
    message: string;
    notificationTimes: number[];
  }> {
    try {
      const response = await this.client.post<{
        success: boolean;
        message: string;
        notificationTimes: number[];
      }>(`/api/notifications/event/${eventId}/multiple`, { notificationTimes });
      return response;
    } catch (error) {
      throw this.transformError(
        error,
        "Failed to create multiple notifications",
      );
    }
  }
}

// Default instance
export const calendarApiService = new CalendarApiService();
