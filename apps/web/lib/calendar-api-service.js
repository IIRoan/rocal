import { httpClient } from "./http-client";
// Browser notifications removed
export class CalendarApiService {
    client;
    constructor(client) {
        this.client = client || httpClient;
    }
    // Events API methods
    async getEvents(start, end, signal) {
        try {
            const startISO = start.toISOString();
            const endISO = end.toISOString();
            const doFetch = async () => await this.client.get(`/api/events?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`, { signal });
            let response = await doFetch();
            // Validate completeness: events present, dates transformed, and optional structures if backend provides
            const isComplete = (res) => {
                if (!res || !Array.isArray(res.events))
                    return false;
                // Ensure dates are Date objects
                const datesOk = res.events.every((e) => e && e.start instanceof Date && e.end instanceof Date);
                return datesOk;
            };
            if (!isComplete(response)) {
                // Attempt a single re-fetch in case of partial decode or race condition
                await new Promise((r) => setTimeout(r, 150));
                response = await doFetch();
                if (!isComplete(response)) {
                    throw {
                        error: "Incomplete Data",
                        message: "Event data appears incomplete. Please try again in a moment.",
                        statusCode: 502,
                        details: { reason: "validation_failed" },
                    };
                }
            }
            // Note: If backend later adds X-Total-Count header or similar metadata, we can extend HttpClient to expose headers here
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to fetch events");
        }
    }
    async createEvent(event) {
        try {
            const response = await this.client.post("/api/events", event);
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to create event");
        }
    }
    async updateEvent(id, event) {
        try {
            const response = await this.client.put(`/api/events/${id}`, event);
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to update event");
        }
    }
    async deleteEvent(id) {
        try {
            const response = await this.client.delete(`/api/events/${id}`);
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to delete event");
        }
    }
    // Calendars API methods
    async getCalendars() {
        try {
            const response = await this.client.get("/api/calendars");
            return response.calendars;
        }
        catch (error) {
            throw this.transformError(error, "Failed to fetch calendars");
        }
    }
    async createCalendar(calendar) {
        try {
            const response = await this.client.post("/api/calendars", calendar);
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to create calendar");
        }
    }
    async updateCalendar(id, calendar) {
        try {
            const response = await this.client.put(`/api/calendars/${id}`, calendar);
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to update calendar");
        }
    }
    async deleteCalendar(id) {
        try {
            const response = await this.client.delete(`/api/calendars/${id}`);
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to delete calendar");
        }
    }
    // Categories API methods
    async getCategories() {
        try {
            const response = await this.client.get("/api/categories");
            return response.categories;
        }
        catch (error) {
            throw this.transformError(error, "Failed to fetch categories");
        }
    }
    async createCategory(category) {
        try {
            const response = await this.client.post("/api/categories", category);
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to create category");
        }
    }
    async updateCategory(id, category) {
        try {
            const response = await this.client.put(`/api/categories/${id}`, category);
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to update category");
        }
    }
    async deleteCategory(id) {
        try {
            const response = await this.client.delete(`/api/categories/${id}`);
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to delete category");
        }
    }
    // Utility methods
    transformError(error, defaultMessage) {
        // If it's already an ApiError from the HTTP client, return it
        if (error.statusCode && error.error && error.message) {
            return error;
        }
        // Handle network errors
        if (error.name === "TypeError" || error.name === "AbortError") {
            return {
                error: "Network Error",
                message: "Unable to connect to the server. Please check your internet connection.",
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
    static dateToISO(date) {
        return date.toISOString();
    }
    // Helper method to validate event data before sending to API
    static validateEventData(event) {
        const errors = [];
        if ("title" in event && (!event.title || !event.title.trim())) {
            errors.push("Title is required");
        }
        if ("calendarId" in event && !event.calendarId) {
            errors.push("Calendar is required");
        }
        if ("title" in event && event.title && event.title.length > 255) {
            errors.push("Title cannot exceed 255 characters");
        }
        if ("description" in event &&
            event.description &&
            event.description.length > 1000) {
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
    static validateCategoryData(category) {
        const errors = [];
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
    async getUserSettings() {
        try {
            const response = await this.client.get("/api/settings");
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to fetch user settings");
        }
    }
    async updateUserSettings(settings) {
        try {
            const response = await this.client.put("/api/settings", settings);
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to update user settings");
        }
    }
    async resetUserSettings() {
        try {
            const response = await this.client.delete("/api/settings");
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to reset user settings");
        }
    }
    // Recurring Events API methods
    async validateRecurrence(rule) {
        try {
            const response = await this.client.post("/api/recurring/validate", { rule });
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to validate recurrence rule");
        }
    }
    async previewRecurrence(eventStart, eventEnd, recurrenceRule, previewDays) {
        try {
            const response = await this.client.post("/api/recurring/preview", {
                eventStart,
                eventEnd,
                recurrenceRule,
                previewDays,
            });
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to generate recurrence preview");
        }
    }
    async getRecurrencePatterns() {
        try {
            const response = await this.client.get("/api/recurring/patterns");
            return response.patterns;
        }
        catch (error) {
            throw this.transformError(error, "Failed to fetch recurrence patterns");
        }
    }
    async editRecurringEvent(id, request) {
        try {
            const response = await this.client.put(`/api/recurring/event/${id}`, request);
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to edit recurring event");
        }
    }
    async deleteRecurringEvent(id, deleteScope, occurrenceDate) {
        try {
            const params = new URLSearchParams({ deleteScope });
            if (occurrenceDate)
                params.append("occurrenceDate", occurrenceDate);
            const response = await this.client.delete(`/api/recurring/event/${id}?${params}`);
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to delete recurring event");
        }
    }
    // Enhanced Calendar Deletion
    async deleteCalendarAdvanced(id, action, targetCalendarId) {
        try {
            const params = new URLSearchParams();
            if (action)
                params.append("action", action);
            if (targetCalendarId)
                params.append("targetCalendarId", targetCalendarId);
            const response = await this.client.delete(`/api/calendars/${id}?${params}`);
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to delete calendar");
        }
    }
    // ICS Import
    async importICS(request) {
        try {
            const response = await this.client.post("/api/subscriptions/import-ics", request);
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to import ICS file");
        }
    }
    // Calendar Subscriptions API methods
    async getSubscriptions() {
        try {
            const response = await this.client.get("/api/subscriptions");
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to load subscriptions");
        }
    }
    async createSubscription(request) {
        try {
            const response = await this.client.post("/api/subscriptions", request);
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to create subscription");
        }
    }
    async updateSubscription(id, request) {
        try {
            const response = await this.client.put(`/api/subscriptions/${id}`, request);
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to update subscription");
        }
    }
    async deleteSubscription(id, deleteEvents = false) {
        try {
            const params = new URLSearchParams();
            if (deleteEvents)
                params.append("deleteEvents", "true");
            const response = await this.client.delete(`/api/subscriptions/${id}?${params}`);
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to delete subscription");
        }
    }
    async syncSubscription(id) {
        try {
            const response = await this.client.post(`/api/subscriptions/${id}/sync`, {});
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to sync subscription");
        }
    }
    // Bulk Event Operations
    async bulkEventOperation(request) {
        try {
            const response = await this.client.post("/api/events/bulk", request);
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to perform bulk event operation");
        }
    }
    // Notification API methods
    async triggerReminderCheck() {
        try {
            const response = await this.client.post("/api/notifications/trigger-check", {});
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to trigger reminder check");
        }
    }
    async getNotificationStatus() {
        try {
            const response = await this.client.get("/api/notifications/status");
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to get notification status");
        }
    }
    async getEventNotifications(eventId) {
        try {
            const response = await this.client.get(`/api/notifications/event/${eventId}`);
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to get event notifications");
        }
    }
    async updateEventNotifications(eventId, notifications) {
        try {
            const response = await this.client.put(`/api/notifications/event/${eventId}`, { notifications });
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to update event notifications");
        }
    }
    // Browser notification methods removed
    // New email notification methods
    async createMultipleNotifications(eventId, notificationTimes) {
        try {
            const response = await this.client.post(`/api/notifications/event/${eventId}/multiple`, { notificationTimes });
            return response;
        }
        catch (error) {
            throw this.transformError(error, "Failed to create multiple notifications");
        }
    }
}
// Default instance
export const calendarApiService = new CalendarApiService();
