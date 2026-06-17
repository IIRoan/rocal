import { HttpClient } from "./http-client";
import { NoopE2eeProvider, type E2eeProvider } from "./e2ee-provider";
import {
  validateEventData as coreValidateEventData,
  validateCategoryData as coreValidateCategoryData,
  shouldSealImportedInvitationEncryption,
  parseMailCalendarInviteFromIcs,
  type InvitationImportEncryptionPayload,
} from "@workspace/calendar-core";
import type {
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
  CalendarDeleteResponse,
  BulkEventRequest,
  BulkEventResponse,
  NotificationStatus,
  EventNotification,
  CreateNotificationRequest,
  CalendarSubscription,
  CreateSubscriptionRequest,
  UpdateSubscriptionRequest,
  DeleteSubscriptionResponse,
  SyncSubscriptionResponse,
  ImportICSRequest,
  ImportICSResponse,
  CalendarShareLink,
  CreateCalendarShareLinkRequestPayload,
  DisableCalendarShareLinkResponsePayload,
  EventSearchResult,
  EventSearchParams,
  EventSearchCorpusResult,
  EventSearchCorpusParams,
} from "@workspace/calendar-core";

const ENCRYPTED_EVENT_PLACEHOLDER_TITLE = "Encrypted event";

export type DeleteAccountResponse = {
  success: boolean;
  message: string;
  deletedUserId: string;
};

export type InvitationImportSummary = {
  messagesScanned: number;
  icsPartsFound: number;
  eventsCreated: number;
  eventsUpdated: number;
  eventsDeleted: number;
  errors: string[];
};

export class CalendarApiService {
  private client: HttpClient;
  private e2ee: E2eeProvider;

  constructor(client: HttpClient, e2eeProvider?: E2eeProvider) {
    this.client = client;
    this.e2ee = e2eeProvider ?? new NoopE2eeProvider();
  }

  /**
   * Replace the E2EE provider at runtime (e.g. after auth bootstrap).
   */
  setE2eeProvider(provider: E2eeProvider): void {
    this.e2ee = provider;
  }

  // ─── Normalization helpers ───────────────────────────────────────────────────

  private normalizeCalendarForUi(calendar: Calendar): Calendar {
    return {
      ...calendar,
      encryptionState:
        calendar.encryptionState ??
        (calendar.encryptedName ? "shadow_write" : "plaintext"),
      encryptedName: null,
      blindIndexTokens: null,
    };
  }

  private normalizeCategoryForUi(category: EventCategory): EventCategory {
    return {
      ...category,
      encryptionState:
        category.encryptionState ??
        (category.encryptedName ? "shadow_write" : "plaintext"),
      encryptedName: null,
      blindIndexTokens: null,
    };
  }

  private normalizeEventForUi(event: CalendarEvent): CalendarEvent {
    return {
      ...event,
      encryptionState:
        event.encryptionState ??
        (event.encryptedContent ? "shadow_write" : "plaintext"),
      encryptedContent: null,
      blindIndexTokens: null,
    };
  }

  private normalizeUndecryptableEncryptedEvent(
    event: CalendarEvent,
  ): CalendarEvent {
    return this.normalizeEventForUi({
      ...event,
      title: event.title?.trim() || ENCRYPTED_EVENT_PLACEHOLDER_TITLE,
      description: null,
      location: null,
      encryptionState: "encrypted",
    });
  }

  private async hydrateEncryptedEvent(
    event: CalendarEvent,
  ): Promise<CalendarEvent> {
    if (
      event.encryptionState !== "encrypted" ||
      !event.encryptedContent ||
      typeof event.encryptedContent !== "string"
    ) {
      return this.normalizeEventForUi(event);
    }

    try {
      return this.normalizeEventForUi(
        await this.e2ee.hydrateEncryptedEvent(event),
      );
    } catch {
      return this.normalizeUndecryptableEncryptedEvent(event);
    }
  }

  private async hydrateEncryptedEvents(
    events: CalendarEvent[],
  ): Promise<CalendarEvent[]> {
    return Promise.all(
      events.map((event) => this.hydrateEncryptedEvent(event)),
    );
  }

  // ─── Events ──────────────────────────────────────────────────────────────────

  async getEvents(
    start: Date,
    end: Date,
    signal?: AbortSignal,
  ): Promise<EventsResponse> {
    try {
      const startISO = start.toISOString();
      const endISO = end.toISOString();

      const response = await this.client.get<EventsResponse>(
        `/api/events?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`,
        { signal },
      );

      if (!response || !Array.isArray(response.events)) {
        throw {
          error: "Incomplete Data",
          message:
            "Event data appears incomplete. Please try again in a moment.",
          statusCode: 502,
          details: { reason: "validation_failed" },
        };
      }

      const events = response.events.map((event) => {
        if (!event) {
          throw {
            error: "Incomplete Data",
            message:
              "Event data appears incomplete. Please try again in a moment.",
            statusCode: 502,
            details: { reason: "validation_failed" },
          };
        }

        const start =
          event.start instanceof Date
            ? event.start
            : event.start != null
              ? new Date(event.start)
              : new Date(NaN);
        const end =
          event.end instanceof Date
            ? event.end
            : event.end != null
              ? new Date(event.end)
              : new Date(NaN);
        if (
          Number.isNaN(start.getTime()) ||
          Number.isNaN(end.getTime())
        ) {
          throw {
            error: "Incomplete Data",
            message:
              "Event data appears incomplete. Please try again in a moment.",
            statusCode: 502,
            details: { reason: "validation_failed" },
          };
        }
        return { ...event, start, end };
      });

      return {
        ...response,
        events: await this.hydrateEncryptedEvents(events),
        calendars: response.calendars.map((calendar) =>
          this.normalizeCalendarForUi(calendar),
        ),
        categories: response.categories.map((category) =>
          this.normalizeCategoryForUi(category),
        ),
      };
    } catch (error) {
      throw this.transformError(error, "Failed to fetch events");
    }
  }

  async getEvent(id: string): Promise<CalendarEvent> {
    try {
      const response = await this.client.get<CalendarEvent>(
        `/api/events/${id}`,
      );
      return await this.hydrateEncryptedEvent(response);
    } catch (error) {
      throw this.transformError(error, "Failed to fetch event");
    }
  }

  async getInvitationByExternalId(
    externalId: string,
    options: { syncRemote?: boolean } = {},
  ): Promise<CalendarEvent | null> {
    try {
      const searchParams = new URLSearchParams({
        externalId,
      });
      if (options.syncRemote === false) {
        searchParams.set("syncRemote", "false");
      }
      const response = await this.client.get<{ event: CalendarEvent | null }>(
        `/api/events/invitations/by-external-id?${searchParams.toString()}`,
      );
      return response.event
        ? await this.hydrateEncryptedEvent(response.event)
        : null;
    } catch (error) {
      throw this.transformError(error, "Failed to fetch calendar invitation");
    }
  }

  async importInvitationIcs(
    icsContent: string,
    options: {
      status?: "accepted" | "tentative";
      calendarId?: string;
    } = {},
  ): Promise<InvitationImportSummary> {
    try {
      const encryption = await this.buildInvitationImportEncryption(icsContent);

      return await this.client.post<InvitationImportSummary>(
        "/api/events/invitations/import-ics",
        {
          icsContent,
          ...(options.status ? { status: options.status } : {}),
          ...(options.calendarId ? { calendarId: options.calendarId } : {}),
          ...(encryption ? { encryption } : {}),
        },
      );
    } catch (error) {
      throw this.transformError(error, "Failed to import calendar invitation");
    }
  }

  private async buildInvitationImportEncryption(
    icsContent: string,
  ): Promise<InvitationImportEncryptionPayload[] | undefined> {
    const parsed = parseMailCalendarInviteFromIcs(icsContent);
    if (!parsed) {
      return undefined;
    }

    const shadow = await this.e2ee.attachEventEncryptionShadow({
      title: parsed.title,
      description: parsed.description,
      location: parsed.location,
    } as UpdateEventRequest);

    if (!shadow.encryptedContent) {
      return undefined;
    }

    return [
      {
        externalId: parsed.uid,
        encryptedContent: shadow.encryptedContent,
        ...(shadow.blindIndexTokens
          ? { blindIndexTokens: shadow.blindIndexTokens }
          : {}),
        ...(shadow.encryptionKeyVersion
          ? { encryptionKeyVersion: shadow.encryptionKeyVersion }
          : {}),
      },
    ];
  }

  async declineInvitationIcs(
    icsContent: string,
  ): Promise<{ declined: true }> {
    try {
      return await this.client.post<{ declined: true }>(
        "/api/events/invitations/decline-ics",
        { icsContent },
      );
    } catch (error) {
      throw this.transformError(error, "Failed to decline calendar invitation");
    }
  }

  async sealEventEncryption(
    event: Pick<
      CalendarEvent,
      | "id"
      | "title"
      | "description"
      | "location"
      | "externalId"
      | "isSynced"
      | "subscriptionId"
      | "encryptionState"
      | "encryptedContent"
    >,
  ): Promise<CalendarEvent | null> {
    if (!shouldSealImportedInvitationEncryption(event)) {
      return null;
    }

    const shadow = await this.e2ee.attachEventEncryptionShadow({
      title: event.title,
      description: event.description ?? undefined,
      location: event.location ?? undefined,
    } as UpdateEventRequest);

    if (!shadow.encryptedContent) {
      return null;
    }

    try {
      const response = await this.client.post<CalendarEvent>(
        `/api/events/${event.id}/seal-encryption`,
        {
          encryptedContent: shadow.encryptedContent,
          ...(shadow.blindIndexTokens
            ? { blindIndexTokens: shadow.blindIndexTokens }
            : {}),
          ...(shadow.encryptionKeyVersion
            ? { encryptionKeyVersion: shadow.encryptionKeyVersion }
            : {}),
        },
      );
      return await this.hydrateEncryptedEvent(response);
    } catch (error) {
      throw this.transformError(error, "Failed to seal event encryption");
    }
  }

  async sealImportedInvitationIfNeeded(
    event: CalendarEvent,
  ): Promise<CalendarEvent> {
    try {
      const sealed = await this.sealEventEncryption(event);
      return sealed ?? event;
    } catch {
      return event;
    }
  }

  async respondToInvitation(
    id: string,
    status: "accepted" | "declined" | "tentative",
  ): Promise<CalendarEvent | { deleted: true }> {
    try {
      const response = await this.client.post<
        CalendarEvent | { deleted: true }
      >(`/api/events/${id}/rsvp`, { status });
      if ("deleted" in response && response.deleted) {
        return { deleted: true };
      }
      return await this.hydrateEncryptedEvent(response as CalendarEvent);
    } catch (error) {
      throw this.transformError(error, "Failed to respond to invitation");
    }
  }

  async searchEvents(
    params: EventSearchParams,
    signal?: AbortSignal,
  ): Promise<EventSearchResult> {
    try {
      const searchParams = new URLSearchParams({ q: params.q });

      const blindIndexTokens = await this.e2ee.createBlindIndexTokens(params.q);
      if (blindIndexTokens.length > 0) {
        searchParams.set("blindIndexTokens", blindIndexTokens.join(","));
      }

      if (params.limit != null) searchParams.set("limit", String(params.limit));
      if (params.offset != null) searchParams.set("offset", String(params.offset));
      if (params.startDate) searchParams.set("startDate", params.startDate);
      if (params.endDate) searchParams.set("endDate", params.endDate);

      const response = await this.client.get<EventSearchResult>(
        `/api/events/search?${searchParams.toString()}`,
        { signal },
      );
      return {
        ...response,
        events: await this.hydrateEncryptedEvents(response.events),
      };
    } catch (error) {
      throw this.transformError(error, "Failed to search events");
    }
  }

  async getEventSearchCorpus(
    params: EventSearchCorpusParams = {},
    signal?: AbortSignal,
  ): Promise<EventSearchCorpusResult> {
    try {
      const searchParams = new URLSearchParams();
      if (params.limit != null) searchParams.set("limit", String(params.limit));
      if (params.offset != null) searchParams.set("offset", String(params.offset));
      if (params.updatedAfter) {
        searchParams.set("updatedAfter", params.updatedAfter);
      }

      const query = searchParams.toString();
      const response = await this.client.get<EventSearchCorpusResult>(
        `/api/events/search-corpus${query ? `?${query}` : ""}`,
        { signal },
      );

      return {
        ...response,
        events: await this.hydrateEncryptedEvents(response.events),
      };
    } catch (error) {
      throw this.transformError(
        error,
        "Failed to load event search corpus",
      );
    }
  }

  async createEvent(event: CreateEventRequest): Promise<CalendarEvent> {
    try {
      const payload = await this.e2ee.attachEventEncryptionShadow(event);
      const response = await this.client.post<CalendarEvent>(
        "/api/events",
        payload,
      );
      return await this.hydrateEncryptedEvent(response);
    } catch (error) {
      throw this.transformError(error, "Failed to create event");
    }
  }

  async updateEvent(
    id: string,
    event: UpdateEventRequest,
  ): Promise<CalendarEvent> {
    try {
      const payload = await this.e2ee.attachEventEncryptionShadow(event);
      const response = await this.client.put<CalendarEvent>(
        `/api/events/${id}`,
        payload,
      );
      return await this.hydrateEncryptedEvent(response);
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

  // ─── Calendars ───────────────────────────────────────────────────────────────

  async getCalendars(): Promise<Calendar[]> {
    try {
      const response =
        await this.client.get<CalendarsResponse>("/api/calendars");
      return response.calendars.map((calendar) =>
        this.normalizeCalendarForUi(calendar),
      );
    } catch (error) {
      throw this.transformError(error, "Failed to fetch calendars");
    }
  }

  async createCalendar(calendar: CreateCalendarRequest): Promise<Calendar> {
    try {
      const payload = await this.e2ee.attachCalendarEncryptionShadow(calendar);
      const response = await this.client.post<Calendar>(
        "/api/calendars",
        payload,
      );
      return this.normalizeCalendarForUi(response);
    } catch (error) {
      throw this.transformError(error, "Failed to create calendar");
    }
  }

  async updateCalendar(
    id: string,
    calendar: UpdateCalendarRequest,
  ): Promise<Calendar> {
    try {
      const payload = await this.e2ee.attachCalendarEncryptionShadow(calendar);
      const response = await this.client.put<Calendar>(
        `/api/calendars/${id}`,
        payload,
      );
      return this.normalizeCalendarForUi(response);
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

  // ─── Categories ──────────────────────────────────────────────────────────────

  async getCategories(): Promise<EventCategory[]> {
    try {
      const response =
        await this.client.get<CategoriesResponse>("/api/categories");
      return response.categories.map((category) =>
        this.normalizeCategoryForUi(category),
      );
    } catch (error) {
      throw this.transformError(error, "Failed to fetch categories");
    }
  }

  async createCategory(
    category: CreateCategoryRequest,
  ): Promise<EventCategory> {
    try {
      const payload = await this.e2ee.attachCategoryEncryptionShadow(category);
      const response = await this.client.post<EventCategory>(
        "/api/categories",
        payload,
      );
      return this.normalizeCategoryForUi(response);
    } catch (error) {
      throw this.transformError(error, "Failed to create category");
    }
  }

  async updateCategory(
    id: string,
    category: UpdateCategoryRequest,
  ): Promise<EventCategory> {
    try {
      const payload = await this.e2ee.attachCategoryEncryptionShadow(category);
      const response = await this.client.put<EventCategory>(
        `/api/categories/${id}`,
        payload,
      );
      return this.normalizeCategoryForUi(response);
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

  // ─── Settings ────────────────────────────────────────────────────────────────

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
      return await this.client.delete<{
        success: boolean;
        message: string;
      }>("/api/settings");
    } catch (error) {
      throw this.transformError(error, "Failed to reset user settings");
    }
  }

  async deleteAccount(): Promise<DeleteAccountResponse> {
    try {
      return await this.client.delete<DeleteAccountResponse>("/api/account");
    } catch (error) {
      throw this.transformError(error, "Failed to delete account");
    }
  }

  // ─── Recurring Events ────────────────────────────────────────────────────────

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
        { eventStart, eventEnd, recurrenceRule, previewDays },
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
      return await this.client.put<CalendarEvent>(
        `/api/recurring/event/${id}`,
        request,
      );
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

      return await this.client.delete<{
        success: boolean;
        message: string;
      }>(`/api/recurring/event/${id}?${params}`);
    } catch (error) {
      throw this.transformError(error, "Failed to delete recurring event");
    }
  }

  // ─── ICS Import ──────────────────────────────────────────────────────────────

  async importICS(request: ImportICSRequest): Promise<ImportICSResponse> {
    try {
      return await this.client.post<ImportICSResponse>(
        "/api/subscriptions/import-ics",
        request,
      );
    } catch (error) {
      throw this.transformError(error, "Failed to import ICS file");
    }
  }

  // ─── Subscriptions ───────────────────────────────────────────────────────────

  async getSubscriptions(): Promise<CalendarSubscription[]> {
    try {
      return await this.client.get<CalendarSubscription[]>(
        "/api/subscriptions",
      );
    } catch (error) {
      throw this.transformError(error, "Failed to load subscriptions");
    }
  }

  async createSubscription(
    request: CreateSubscriptionRequest,
  ): Promise<CalendarSubscription> {
    try {
      return await this.client.post<CalendarSubscription>(
        "/api/subscriptions",
        request,
      );
    } catch (error) {
      throw this.transformError(error, "Failed to create subscription");
    }
  }

  async updateSubscription(
    id: string,
    request: UpdateSubscriptionRequest,
  ): Promise<CalendarSubscription> {
    try {
      return await this.client.put<CalendarSubscription>(
        `/api/subscriptions/${id}`,
        request,
      );
    } catch (error) {
      throw this.transformError(error, "Failed to update subscription");
    }
  }

  async deleteSubscription(
    id: string,
    deleteEvents = false,
  ): Promise<DeleteSubscriptionResponse> {
    try {
      const params = new URLSearchParams();
      if (deleteEvents) params.append("deleteEvents", "true");

      return await this.client.delete<DeleteSubscriptionResponse>(
        `/api/subscriptions/${id}?${params}`,
      );
    } catch (error) {
      throw this.transformError(error, "Failed to delete subscription");
    }
  }

  async syncSubscription(id: string): Promise<SyncSubscriptionResponse> {
    try {
      return await this.client.post<SyncSubscriptionResponse>(
        `/api/subscriptions/${id}/sync`,
        {},
      );
    } catch (error) {
      throw this.transformError(error, "Failed to sync subscription");
    }
  }

  // ─── Calendar Sharing ────────────────────────────────────────────────────────

  async getCalendarShareLink(calendarId: string): Promise<CalendarShareLink> {
    try {
      return await this.client.get<CalendarShareLink>(
        `/api/calendars/${calendarId}/share-link`,
      );
    } catch (error) {
      throw this.transformError(error, "Failed to get calendar share link");
    }
  }

  async enableCalendarShareLink(
    calendarId: string,
    request?: CreateCalendarShareLinkRequestPayload,
  ): Promise<CalendarShareLink> {
    try {
      return await this.client.post<CalendarShareLink>(
        `/api/calendars/${calendarId}/share-link`,
        request || {},
      );
    } catch (error) {
      throw this.transformError(error, "Failed to enable calendar share link");
    }
  }

  async disableCalendarShareLink(
    calendarId: string,
  ): Promise<DisableCalendarShareLinkResponsePayload> {
    try {
      return await this.client.delete<DisableCalendarShareLinkResponsePayload>(
        `/api/calendars/${calendarId}/share-link`,
      );
    } catch (error) {
      throw this.transformError(error, "Failed to disable calendar share link");
    }
  }

  // ─── Bulk Operations ─────────────────────────────────────────────────────────

  async bulkEventOperation(
    request: BulkEventRequest,
  ): Promise<BulkEventResponse> {
    try {
      return await this.client.post<BulkEventResponse>(
        "/api/events/bulk",
        request,
      );
    } catch (error) {
      throw this.transformError(
        error,
        "Failed to perform bulk event operation",
      );
    }
  }

  // ─── Notifications ───────────────────────────────────────────────────────────

  async triggerReminderCheck(): Promise<{ success: boolean; message: string }> {
    try {
      return await this.client.post<{
        success: boolean;
        message: string;
      }>("/api/notifications/trigger-check", {});
    } catch (error) {
      throw this.transformError(error, "Failed to trigger reminder check");
    }
  }

  async getNotificationStatus(): Promise<NotificationStatus> {
    try {
      return await this.client.get<NotificationStatus>(
        "/api/notifications/status",
      );
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
      return await this.client.put<{
        success: boolean;
        message: string;
      }>(`/api/notifications/event/${eventId}`, { notifications });
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
      throw this.transformError(
        error,
        "Failed to create multiple notifications",
      );
    }
  }

  // ─── Utilities ───────────────────────────────────────────────────────────────

  private transformError(error: unknown, defaultMessage: string): ApiError {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      "error" in error &&
      "message" in error
    ) {
      return error as ApiError;
    }

    if (error instanceof Error && error.name === "TypeError") {
      return {
        error: "Network Error",
        message:
          "Unable to connect to the server. Please check your internet connection.",
        statusCode: 0,
      };
    }

    if (error instanceof Error && error.name === "AbortError") {
      return {
        error: "Timeout Error",
        message: "The request took too long to complete. Please try again.",
        statusCode: 0,
      };
    }

    return {
      error: "Unknown Error",
      message:
        error instanceof Error && error.message
          ? error.message
          : defaultMessage,
      statusCode:
        error &&
        typeof error === "object" &&
        "status" in error &&
        typeof (error as { status?: unknown }).status === "number"
          ? ((error as { status: number }).status ?? 500)
          : 500,
    };
  }

  static dateToISO(date: Date): string {
    return date.toISOString();
  }

  static validateEventData(
    event: CreateEventRequest | UpdateEventRequest,
  ): string[] {
    return coreValidateEventData(event);
  }

  static validateCategoryData(
    category: CreateCategoryRequest | UpdateCategoryRequest,
  ): string[] {
    return coreValidateCategoryData(category);
  }
}
