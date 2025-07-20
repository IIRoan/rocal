import { httpClient, HttpClient } from "./http-client";
import {
  CalendarEvent,
  EventCategory,
  EventsResponse,
  CategoriesResponse,
  CreateEventRequest,
  UpdateEventRequest,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  DeleteResponse,
  ApiError,
} from "./types/calendar";

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
        `/api/events?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`
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
        event
      );
      return response;
    } catch (error) {
      throw this.transformError(error, "Failed to create event");
    }
  }

  async updateEvent(
    id: string,
    event: UpdateEventRequest
  ): Promise<CalendarEvent> {
    try {
      const response = await this.client.put<CalendarEvent>(
        `/api/events/${id}`,
        event
      );
      return response;
    } catch (error) {
      throw this.transformError(error, "Failed to update event");
    }
  }

  async deleteEvent(id: string): Promise<DeleteResponse> {
    try {
      const response = await this.client.delete<DeleteResponse>(
        `/api/events/${id}`
      );
      return response;
    } catch (error) {
      throw this.transformError(error, "Failed to delete event");
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
    category: CreateCategoryRequest
  ): Promise<EventCategory> {
    try {
      const response = await this.client.post<EventCategory>(
        "/api/categories",
        category
      );
      return response;
    } catch (error) {
      throw this.transformError(error, "Failed to create category");
    }
  }

  async updateCategory(
    id: string,
    category: UpdateCategoryRequest
  ): Promise<EventCategory> {
    try {
      const response = await this.client.put<EventCategory>(
        `/api/categories/${id}`,
        category
      );
      return response;
    } catch (error) {
      throw this.transformError(error, "Failed to update category");
    }
  }

  async deleteCategory(id: string): Promise<DeleteResponse> {
    try {
      const response = await this.client.delete<DeleteResponse>(
        `/api/categories/${id}`
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
    event: CreateEventRequest | UpdateEventRequest
  ): string[] {
    const errors: string[] = [];

    if ("title" in event && (!event.title || !event.title.trim())) {
      errors.push("Title is required");
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
    category: CreateCategoryRequest | UpdateCategoryRequest
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
}

// Default instance
export const calendarApiService = new CalendarApiService();
