import type { Schema } from "@workspace/api-contracts";
import { HttpClient, type ApiResponse } from "./http-client";
import {
  NoopE2eeProvider,
  hydrateEncryptedNameWithoutSession,
  type E2eeProvider,
} from "@workspace/e2ee";
import {
  DEFAULT_CALENDARS,
  EVENT_CONTENT_FIELDS,
  partitionCalendarsByKind,
  validateEventData as coreValidateEventData,
  validateCategoryData as coreValidateCategoryData,
  shouldSealImportedInvitationEncryption,
  parseMailCalendarInviteFromIcs,
  type InvitationImportEncryptionPayload,
  encryptedIcsImportEventSchema,
  type EncryptedIcsImportEvent,
  USER_SETTINGS_PREFERENCES_AAD,
  pickUserSettingsPreferences,
  readUserSettingsPreferences,
  splitUserSettingsUpdate,
  type UserSettingsPreferences,
} from "@workspace/calendar-core";
import type {
  CalendarEvent,
  Calendar,
  EventCategory,
  EventsResponse,
  CreateEventRequest,
  UpdateEventRequest,
  WithOperationWarnings,
  CreateCalendarRequest,
  UpdateCalendarRequest,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  DeleteResponse,
  ApiError,
  UserSettings,
  UpdateSettingsRequest,
  PutRecentContactsRequest,
  PutMailSettingsRequest,
  RecurrencePreview,
  RecurrenceRule,
  EditRecurringEventRequest,
  CalendarDeleteResponse,
  BulkEventRequest,
  BulkEventResponse,
  CreateNotificationRequest,
  CalendarSubscription,
  RegisterPushDeviceRequest,
  PushDeviceRegistrationResult,
  PushDeviceUnregisterResult,
  PushTestNotificationResult,
  CreateSubscriptionRequest,
  UpdateSubscriptionRequest,
  DeleteSubscriptionResponse,
  SyncSubscriptionResponse,
  ImportICSRequest,
  ImportICSResponse,
  EventSearchCorpusResult,
  EventSearchCorpusParams,
  SolaceProfileLookupRequest,
  SolaceProfileLookupResponse,
  UploadProfileAvatarRequest,
  ProfileAvatarResponse,
} from "@workspace/calendar-core";

const ENCRYPTED_EVENT_PLACEHOLDER_TITLE = "Encrypted event";
const SETTINGS_WRITE_RETRIES = 2;

/** The API answers 409 when sealed preferences changed since the write read them. */
function isConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    error.statusCode === 409
  );
}

/** New ciphertext replaces every content field, so an update that sets only some of them needs the stored rest. */
function needsStoredContent(request: UpdateEventRequest): boolean {
  const set = EVENT_CONTENT_FIELDS.filter(
    (field) => request[field] !== undefined,
  ).length;
  return set > 0 && set < EVENT_CONTENT_FIELDS.length;
}

function withStoredContent(
  request: UpdateEventRequest,
  stored: CalendarEvent,
): UpdateEventRequest {
  return {
    ...request,
    title: request.title ?? stored.title,
    description: request.description ?? stored.description ?? undefined,
    location: request.location ?? stored.location ?? undefined,
    color: request.color ?? stored.color ?? undefined,
    categoryId: request.categoryId ?? stored.categoryId ?? undefined,
  };
}

// `as` casts from API types only narrow free-text fields (kind, encryptionState, role, status) to calendar-core's literal unions.
export class CalendarApiService {
  private client: HttpClient;
  private e2ee: E2eeProvider;
  private defaultCalendarsSeed: Promise<boolean> | null = null;
  private settingsWrites: Promise<unknown> = Promise.resolve();

  constructor(client: HttpClient, e2eeProvider?: E2eeProvider) {
    this.client = client;
    this.e2ee = e2eeProvider ?? new NoopE2eeProvider();
  }

  /** Replace the E2EE provider at runtime (e.g. after auth bootstrap). */
  setE2eeProvider(provider: E2eeProvider): void {
    this.e2ee = provider;
  }

  /** Safe on every launch: resolves true only when it asked the server to create the encrypted default calendars. */
  ensureDefaultCalendars(): Promise<boolean> {
    this.defaultCalendarsSeed ??= this.seedDefaultCalendars().finally(() => {
      this.defaultCalendarsSeed = null;
    });
    return this.defaultCalendarsSeed;
  }

  private async seedDefaultCalendars(): Promise<boolean> {
    if (!(await this.e2ee.hasActiveSession())) {
      return false;
    }

    const existing = await this.client.get<Schema<"CalendarList">>("/api/calendars");
    if (partitionCalendarsByKind(existing.calendars as Calendar[]).ownedCalendars.length > 0) {
      return false;
    }

    const calendars = await Promise.all(
      DEFAULT_CALENDARS.map(async (calendar) => {
        const { encryptedName, ...wire } =
          await this.e2ee.attachCalendarEncryptionShadow(calendar);
        // Never upload a body that still carries a plaintext name (session lost mid-run).
        if (!encryptedName || "name" in wire) {
          throw new Error("Default calendar names were not encrypted");
        }
        return { ...wire, encryptedName };
      }),
    );

    await this.client.post<Schema<"CalendarList">>("/api/calendars/defaults", {
      calendars,
    } satisfies Schema<"SeedDefaultCalendarsRequest">);
    return true;
  }

  // ─── Normalization helpers ───────────────────────────────────────────────────

  private async hydrateCalendar(calendar: Calendar): Promise<Calendar> {
    const hydrated = await this.e2ee
      .hydrateEncryptedCalendar(calendar)
      .catch(() => hydrateEncryptedNameWithoutSession("calendar", calendar));

    return {
      ...hydrated,
      encryptionState:
        calendar.encryptionState ??
        (calendar.encryptedName ? "encrypted" : "plaintext"),
      encryptedName: null,
      blindIndexTokens: null,
    };
  }

  private async hydrateCategory(
    category: EventCategory,
  ): Promise<EventCategory> {
    const hydrated = await this.e2ee
      .hydrateEncryptedCategory(category)
      .catch(() => hydrateEncryptedNameWithoutSession("category", category));

    return {
      ...hydrated,
      encryptionState:
        category.encryptionState ??
        (category.encryptedName ? "encrypted" : "plaintext"),
      encryptedName: null,
      blindIndexTokens: null,
    };
  }

  private hydrateCalendars(calendars: Calendar[]): Promise<Calendar[]> {
    return Promise.all(calendars.map((calendar) => this.hydrateCalendar(calendar)));
  }

  private hydrateCategories(
    categories: EventCategory[],
  ): Promise<EventCategory[]> {
    return Promise.all(
      categories.map((category) => this.hydrateCategory(category)),
    );
  }

  private normalizeEventForUi(event: CalendarEvent): CalendarEvent {
    return {
      ...event,
      encryptionState:
        event.encryptionState ??
        (event.encryptedContent ? "encrypted" : "plaintext"),
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
    return this.hydrateEventRelations(
      await this.hydrateEncryptedEventContent(event),
    );
  }

  private async hydrateEventRelations(
    event: CalendarEvent,
  ): Promise<CalendarEvent> {
    const [calendar, category] = await Promise.all([
      event.calendar?.encryptedName
        ? this.hydrateCalendar(event.calendar)
        : event.calendar,
      event.category?.encryptedName
        ? this.hydrateCategory(event.category)
        : event.category,
    ]);

    if (calendar === event.calendar && category === event.category) {
      return event;
    }

    return {
      ...event,
      ...(calendar !== undefined ? { calendar } : {}),
      ...(category !== undefined ? { category } : {}),
    };
  }

  private async hydrateEncryptedEventContent(
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

      const response = (await this.client.get<Schema<"EventList">>(
        `/api/events?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`,
        { signal },
      )) as EventsResponse;

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

      const [hydratedEvents, calendars, categories] = await Promise.all([
        this.hydrateEncryptedEvents(events),
        this.hydrateCalendars(response.calendars),
        this.hydrateCategories(response.categories),
      ]);

      return {
        ...response,
        events: hydratedEvents,
        calendars,
        categories,
      };
    } catch (error) {
      throw this.transformError(error, "Failed to fetch events");
    }
  }

  async getEvent(id: string): Promise<CalendarEvent> {
    try {
      const response = await this.client.get<Schema<"Event">>(
        `/api/events/${encodeURIComponent(id)}`,
      );
      return await this.hydrateEncryptedEvent(response as CalendarEvent);
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
      const response = await this.client.get<Schema<"InvitationLookup">>(
        `/api/events/invitations/by-external-id?${searchParams.toString()}`,
      );
      return response.event
        ? await this.hydrateEncryptedEvent(response.event as CalendarEvent)
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
  ): Promise<Schema<"InvitationImportSummary">> {
    try {
      const encryption = await this.buildInvitationImportEncryption(icsContent);

      return await this.client.post<Schema<"InvitationImportSummary">>(
        "/api/events/invitations/import-ics",
        {
          icsContent,
          ...(options.status ? { status: options.status } : {}),
          ...(options.calendarId ? { calendarId: options.calendarId } : {}),
          ...(encryption ? { encryption } : {}),
        } satisfies Schema<"ImportInvitationRequest">,
      );
    } catch (error) {
      throw this.transformError(error, "Failed to import calendar invitation");
    }
  }

  private async buildInvitationImportEncryption(
    icsContent: string,
  ): Promise<InvitationImportEncryptionPayload[] | undefined> {
    const parsed = parseMailCalendarInviteFromIcs(icsContent);
    if (!parsed || !(await this.e2ee.hasActiveSession())) {
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
  ): Promise<Schema<"InvitationDeclined">> {
    try {
      return await this.client.post<Schema<"InvitationDeclined">>(
        "/api/events/invitations/decline-ics",
        { icsContent } satisfies Schema<"DeclineInvitationRequest">,
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
    if (
      !shouldSealImportedInvitationEncryption(event) ||
      !(await this.e2ee.hasActiveSession())
    ) {
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
      const response = await this.client.post<Schema<"Event">>(
        `/api/events/${encodeURIComponent(event.id)}/seal-encryption`,
        {
          encryptedContent: shadow.encryptedContent,
          ...(shadow.blindIndexTokens
            ? { blindIndexTokens: shadow.blindIndexTokens }
            : {}),
          ...(shadow.encryptionKeyVersion
            ? { encryptionKeyVersion: shadow.encryptionKeyVersion }
            : {}),
        } satisfies Schema<"SealEncryptionRequest">,
      );
      return await this.hydrateEncryptedEvent(response as CalendarEvent);
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
      const response = await this.client.post<Schema<"RsvpResult">>(
        `/api/events/${encodeURIComponent(id)}/rsvp`,
        { status } satisfies Schema<"RsvpRequest">,
      );
      if ("deleted" in response) {
        return response;
      }
      // Answering keeps the copy, so it is sealed here for every caller, as the mail card does.
      return await this.sealImportedInvitationIfNeeded(
        await this.hydrateEncryptedEvent(response as CalendarEvent),
      );
    } catch (error) {
      throw this.transformError(error, "Failed to respond to invitation");
    }
  }

  private fetchEventSearchCorpus(
    params: EventSearchCorpusParams,
    signal?: AbortSignal,
  ) {
    const searchParams = new URLSearchParams();
    if (params.limit != null) searchParams.set("limit", String(params.limit));
    if (params.offset != null) searchParams.set("offset", String(params.offset));
    if (params.updatedAfter) {
      searchParams.set("updatedAfter", params.updatedAfter);
    }
    if (params.readableInvitations) {
      searchParams.set("readableInvitations", "true");
    }

    const query = searchParams.toString();
    return this.client.get<Schema<"EventSearchCorpus">>(
      // repo-rules-allow api-path-ids: appends a URLSearchParams query string, not a path segment.
      `/api/events/search-corpus${query ? `?${query}` : ""}`,
      { signal },
    );
  }

  async getEventSearchCorpus(
    params: EventSearchCorpusParams = {},
    signal?: AbortSignal,
  ): Promise<EventSearchCorpusResult> {
    try {
      const response = await this.fetchEventSearchCorpus(params, signal);

      return {
        ...response,
        events: await this.hydrateEncryptedEvents(
          response.events as CalendarEvent[],
        ),
      };
    } catch (error) {
      throw this.transformError(
        error,
        "Failed to load event search corpus",
      );
    }
  }

  /** Events per category id, counted on this device because the category travels inside the ciphertext. */
  async getCategoryUsageCounts(
    signal?: AbortSignal,
  ): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    let offset = 0;
    do {
      const page = await this.getEventSearchCorpus({ limit: 200, offset }, signal);
      for (const { categoryId } of page.events) {
        if (categoryId) counts[categoryId] = (counts[categoryId] ?? 0) + 1;
      }
      offset = page.nextOffset ?? -1;
    } while (offset >= 0 && !signal?.aborted);
    return counts;
  }

  async createEvent(
    event: CreateEventRequest,
  ): Promise<WithOperationWarnings<CalendarEvent>> {
    try {
      const { encryptedContent, ...payload } =
        await this.e2ee.attachEventEncryptionShadow(event);
      if (!encryptedContent) throw new Error("Event title is required");
      const response = await this.client.post<Schema<"Event">>(
        "/api/events",
        { ...payload, encryptedContent } satisfies Schema<"CreateEventRequest">,
      );
      return await this.hydrateEncryptedEvent(response as CalendarEvent);
    } catch (error) {
      throw this.transformError(error, "Failed to create event");
    }
  }

  async updateEvent(
    id: string,
    event: UpdateEventRequest,
  ): Promise<WithOperationWarnings<CalendarEvent>> {
    try {
      const payload = await this.e2ee.attachEventEncryptionShadow(
        needsStoredContent(event)
          ? withStoredContent(event, await this.getEvent(id))
          : event,
      );
      const response = await this.client.put<Schema<"Event">>(
        `/api/events/${encodeURIComponent(id)}`,
        payload satisfies Schema<"UpdateEventRequest">,
      );
      return await this.hydrateEncryptedEvent(response as CalendarEvent);
    } catch (error) {
      throw this.transformError(error, "Failed to update event");
    }
  }

  async deleteEvent(id: string): Promise<DeleteResponse> {
    try {
      return await this.client.delete<Schema<"EventDeleted">>(
        `/api/events/${encodeURIComponent(id)}`,
      );
    } catch (error) {
      throw this.transformError(error, "Failed to delete event");
    }
  }

  // ─── Calendars ───────────────────────────────────────────────────────────────

  async getCalendars(): Promise<Calendar[]> {
    try {
      const response =
        await this.client.get<Schema<"CalendarList">>("/api/calendars");
      return await this.hydrateCalendars(response.calendars as Calendar[]);
    } catch (error) {
      throw this.transformError(error, "Failed to fetch calendars");
    }
  }

  async createCalendar(calendar: CreateCalendarRequest): Promise<Calendar> {
    try {
      const { encryptedName, ...payload } =
        await this.e2ee.attachCalendarEncryptionShadow(calendar);
      if (!encryptedName) throw new Error("Calendar name is required");
      const response = await this.client.post<Schema<"Calendar">>(
        "/api/calendars",
        { ...payload, encryptedName } satisfies Schema<"CreateCalendarRequest">,
      );
      return await this.hydrateCalendar(response as Calendar);
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
      const response = await this.client.put<Schema<"Calendar">>(
        `/api/calendars/${encodeURIComponent(id)}`,
        payload satisfies Schema<"UpdateCalendarRequest">,
      );
      return await this.hydrateCalendar(response as Calendar);
    } catch (error) {
      throw this.transformError(error, "Failed to update calendar");
    }
  }

  async deleteCalendar(id: string): Promise<DeleteResponse> {
    try {
      return await this.client.delete<Schema<"CalendarDeleteResult">>(
        `/api/calendars/${encodeURIComponent(id)}`,
      );
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

      return await this.client.delete<Schema<"CalendarDeleteResult">>(
        `/api/calendars/${encodeURIComponent(id)}?${params}`,
      );
    } catch (error) {
      throw this.transformError(error, "Failed to delete calendar");
    }
  }

  // ─── Categories ──────────────────────────────────────────────────────────────

  async getCategories(): Promise<EventCategory[]> {
    try {
      const response =
        await this.client.get<Schema<"CategoryList">>("/api/categories");
      return await this.hydrateCategories(
        response.categories as EventCategory[],
      );
    } catch (error) {
      throw this.transformError(error, "Failed to fetch categories");
    }
  }

  async createCategory(
    category: CreateCategoryRequest,
  ): Promise<EventCategory> {
    try {
      const { encryptedName, ...payload } =
        await this.e2ee.attachCategoryEncryptionShadow(category);
      if (!encryptedName) throw new Error("Category name is required");
      const response = await this.client.post<Schema<"Category">>(
        "/api/categories",
        { ...payload, encryptedName } satisfies Schema<"CreateCategoryRequest">,
      );
      return await this.hydrateCategory(response as EventCategory);
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
      const response = await this.client.put<Schema<"Category">>(
        `/api/categories/${encodeURIComponent(id)}`,
        payload satisfies Schema<"UpdateCategoryRequest">,
      );
      return await this.hydrateCategory(response as EventCategory);
    } catch (error) {
      throw this.transformError(error, "Failed to update category");
    }
  }

  /** The server clears only its own column, so the events that seal this category are re-sealed without it before it goes. */
  private async removeSealedCategory(id: string): Promise<void> {
    const assigned: CalendarEvent[] = [];
    let offset = 0;
    do {
      const page = await this.fetchEventSearchCorpus({ limit: 200, offset });
      for (const event of page.events as CalendarEvent[]) {
        if (event.encryptionState !== "encrypted") continue;
        // Without the column the category read back is the sealed one, and an event that does not open is left as it is.
        const opened = await this.e2ee
          .hydrateEncryptedEvent({ ...event, categoryId: null })
          .catch(() => null);
        if (opened?.categoryId === id) assigned.push(opened);
      }
      offset = page.nextOffset ?? -1;
    } while (offset >= 0);
    for (const event of assigned) {
      await this.updateEvent(event.id, {
        title: event.title,
        description: event.description ?? "",
        location: event.location ?? "",
        color: event.color ?? "",
        categoryId: "",
      });
    }
  }

  async deleteCategory(id: string): Promise<DeleteResponse> {
    try {
      await this.removeSealedCategory(id);
      return await this.client.delete<Schema<"SuccessMessage">>(
        `/api/categories/${encodeURIComponent(id)}`,
      );
    } catch (error) {
      throw this.transformError(error, "Failed to delete category");
    }
  }

  // ─── Settings ────────────────────────────────────────────────────────────────

  async getUserSettings(): Promise<UserSettings> {
    try {
      return await this.openUserSettings(
        await this.client.get<Schema<"UserSettings">>("/api/settings"),
      );
    } catch (error) {
      throw this.transformError(error, "Failed to fetch user settings");
    }
  }

  async updateUserSettings(
    settings: UpdateSettingsRequest,
  ): Promise<UserSettings> {
    // One write at a time on this device, so two quick changes never merge onto the same preferences.
    const write = this.settingsWrites.then(() => this.writeUserSettings(settings));
    this.settingsWrites = write.catch(() => undefined);
    return write;
  }

  private async writeUserSettings(
    settings: UpdateSettingsRequest,
    attempt = 0,
  ): Promise<UserSettings> {
    try {
      const { readable, preferences } = splitUserSettingsUpdate(settings);
      if (!preferences) {
        return await this.openUserSettings(
          await this.client.put<Schema<"UserSettings">>("/api/settings", readable),
        );
      }
      const current = await this.client.get<Schema<"UserSettings">>("/api/settings");
      return await this.openUserSettings(
        await this.client.put<Schema<"UserSettings">>("/api/settings", {
          ...readable,
          encryptedPreferences: await this.sealUserSettings(current, preferences),
          expectedEncryptedPreferences: current.encryptedPreferences ?? null,
        } satisfies Schema<"UpdateSettingsRequest">),
      );
    } catch (error) {
      // Another device replaced the preferences first, so the change merges onto its version instead.
      if (attempt < SETTINGS_WRITE_RETRIES && isConflict(error)) {
        return this.writeUserSettings(settings, attempt + 1);
      }
      throw this.transformError(error, "Failed to update user settings");
    }
  }

  /** Seals preferences a server still holds in plaintext; true when it moved them. */
  async ensureSealedUserSettings(): Promise<boolean> {
    const run = this.settingsWrites.then(() => this.sealPlaintextUserSettings());
    this.settingsWrites = run.catch(() => undefined);
    return run;
  }

  private async sealPlaintextUserSettings(): Promise<boolean> {
    if (!(await this.e2ee.hasActiveSession())) {
      return false;
    }
    const settings = await this.client.get<Schema<"UserSettings">>("/api/settings");
    if (settings.encryptedPreferences) {
      return false;
    }
    // A device that sealed them first wins; its preferences are the newer ones.
    return this.client
      .put<Schema<"UserSettings">>("/api/settings", {
        encryptedPreferences: await this.e2ee.encryptJson(
          pickUserSettingsPreferences(settings as UserSettings),
          USER_SETTINGS_PREFERENCES_AAD,
        ),
        expectedEncryptedPreferences: null,
      })
      .then(
        () => true,
        (error: unknown) => {
          if (isConflict(error)) return false;
          throw error;
        },
      );
  }

  private async openUserSettings({
    encryptedPreferences,
    ...settings
  }: ApiResponse<"UserSettings">): Promise<UserSettings> {
    const opened = encryptedPreferences
      ? await this.e2ee.decryptJson(encryptedPreferences, USER_SETTINGS_PREFERENCES_AAD)
      : null;
    return { ...(settings as UserSettings), ...readUserSettingsPreferences(opened) };
  }

  /** The whole blob is replaced, so changes merge onto the current preferences; one that cannot be opened is never overwritten. */
  private async sealUserSettings(
    current: ApiResponse<"UserSettings">,
    changes: Partial<UserSettingsPreferences>,
  ): Promise<string> {
    const opened = current.encryptedPreferences
      ? await this.e2ee.decryptJson(
          current.encryptedPreferences,
          USER_SETTINGS_PREFERENCES_AAD,
        )
      : {};
    if (opened === null) {
      throw new Error("Your settings could not be unlocked on this device.");
    }
    return this.e2ee.encryptJson(
      {
        ...pickUserSettingsPreferences(current as UserSettings),
        ...readUserSettingsPreferences(opened),
        ...changes,
      },
      USER_SETTINGS_PREFERENCES_AAD,
    );
  }

  async resetUserSettings(): Promise<Schema<"SuccessMessage">> {
    try {
      return await this.client.delete<Schema<"SuccessMessage">>("/api/settings");
    } catch (error) {
      throw this.transformError(error, "Failed to reset user settings");
    }
  }

  // ─── Recent contacts ─────────────────────────────────────────────────────────

  async getRecentContacts(): Promise<ApiResponse<"RecentContacts"> | null> {
    try {
      return await this.client.get<Schema<"RecentContacts"> | null>(
        "/api/recent-contacts",
      );
    } catch (error) {
      throw this.transformError(error, "Failed to fetch recent contacts");
    }
  }

  async putRecentContacts(
    request: PutRecentContactsRequest,
  ): Promise<ApiResponse<"RecentContacts">> {
    try {
      return await this.client.put<Schema<"RecentContacts">>(
        "/api/recent-contacts",
        request satisfies Schema<"PutRecentContactsRequest">,
      );
    } catch (error) {
      throw this.transformError(error, "Failed to save recent contacts");
    }
  }

  async getMailSettings(): Promise<ApiResponse<"MailSettings"> | null> {
    try {
      return await this.client.get<Schema<"MailSettings"> | null>(
        "/api/mail-settings",
      );
    } catch (error) {
      throw this.transformError(error, "Failed to fetch mail settings");
    }
  }

  async putMailSettings(
    request: PutMailSettingsRequest,
  ): Promise<ApiResponse<"MailSettings">> {
    try {
      return await this.client.put<Schema<"MailSettings">>(
        "/api/mail-settings",
        request satisfies Schema<"PutMailSettingsRequest">,
      );
    } catch (error) {
      throw this.transformError(error, "Failed to save mail settings");
    }
  }

  async lookupSolaceProfiles(
    request: SolaceProfileLookupRequest,
  ): Promise<SolaceProfileLookupResponse> {
    try {
      return await this.client.post<Schema<"ProfileLookupResponse">>(
        "/api/profiles/lookup",
        request satisfies Schema<"ProfileLookupRequest">,
      );
    } catch (error) {
      throw this.transformError(error, "Failed to look up profile pictures");
    }
  }

  async uploadProfileAvatar(
    request: UploadProfileAvatarRequest,
  ): Promise<ProfileAvatarResponse> {
    try {
      return await this.client.put<Schema<"AvatarResponse">>(
        "/api/profiles/me/avatar",
        request satisfies Schema<"UploadAvatarRequest">,
      );
    } catch (error) {
      throw this.transformError(error, "Failed to upload profile picture");
    }
  }

  async removeProfileAvatar(): Promise<ProfileAvatarResponse> {
    try {
      return await this.client.delete<Schema<"AvatarResponse">>(
        "/api/profiles/me/avatar",
      );
    } catch (error) {
      throw this.transformError(error, "Failed to remove profile picture");
    }
  }

  async deleteAccount(): Promise<Schema<"DeleteAccountResponse">> {
    try {
      return await this.client.delete<Schema<"DeleteAccountResponse">>(
        "/api/account",
      );
    } catch (error) {
      throw this.transformError(error, "Failed to delete account");
    }
  }

  /** Removes this device's E2EE row once sign-out has deleted its private key. */
  async deleteE2eeDevice(
    deviceId: string,
    headers?: Record<string, string>,
  ): Promise<Schema<"SuccessMessage">> {
    try {
      return await this.client.delete<Schema<"SuccessMessage">>(
        `/api/e2ee/devices/${encodeURIComponent(deviceId)}`,
        headers ? { headers } : undefined,
      );
    } catch (error) {
      throw this.transformError(error, "Failed to remove encryption device");
    }
  }

  // ─── Recurring Events ────────────────────────────────────────────────────────

  async validateRecurrence(
    rule: string | RecurrenceRule,
  ): Promise<Schema<"RecurrenceValidation">> {
    try {
      return await this.client.post<Schema<"RecurrenceValidation">>(
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
    recurrenceRule: string | RecurrenceRule,
    previewDays?: number,
  ): Promise<RecurrencePreview> {
    try {
      return await this.client.post<Schema<"RecurrencePreview">>(
        "/api/recurring/preview",
        { eventStart, eventEnd, recurrenceRule, previewDays },
      );
    } catch (error) {
      throw this.transformError(error, "Failed to generate recurrence preview");
    }
  }

  async getRecurrencePatterns(): Promise<
    Schema<"RecurrencePatterns">["patterns"]
  > {
    try {
      const response = await this.client.get<Schema<"RecurrencePatterns">>(
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
      const updates = await this.e2ee.attachEventEncryptionShadow(
        needsStoredContent(request.updates)
          ? withStoredContent(request.updates, await this.getEvent(id))
          : request.updates,
      );
      const response = await this.client.put<Schema<"Event">>(
        `/api/recurring/event/${encodeURIComponent(id)}`,
        {
          ...request,
          updates,
        } satisfies Schema<"EditRecurringRequest">,
      );
      return await this.hydrateEncryptedEvent(response as CalendarEvent);
    } catch (error) {
      throw this.transformError(error, "Failed to edit recurring event");
    }
  }

  async deleteRecurringEvent(
    id: string,
    deleteScope: string,
    occurrenceDate?: string,
  ): Promise<Schema<"RecurringDeleted">> {
    try {
      const params = new URLSearchParams({ deleteScope });
      if (occurrenceDate) params.append("occurrenceDate", occurrenceDate);

      return await this.client.delete<Schema<"RecurringDeleted">>(
        `/api/recurring/event/${encodeURIComponent(id)}?${params}`,
      );
    } catch (error) {
      throw this.transformError(error, "Failed to delete recurring event");
    }
  }

  // ─── ICS Import ──────────────────────────────────────────────────────────────

  async importICS(request: ImportICSRequest): Promise<ImportICSResponse> {
    try {
      if (!(await this.e2ee.hasActiveSession())) throw new Error("Unlock your account before importing a calendar");
      if (request.icsContent.length > 15 * 1024 * 1024) throw new Error("Calendar file is too large");
      const { parseIcsImport } = await import("@workspace/calendar-core/ics-import");
      const timezone = request.timezone ?? (await this.getUserSettings()).timezone;
      const parsed = parseIcsImport(request.icsContent, timezone);
      if (!parsed.events.length) throw new Error("No supported events found in calendar file");
      const encryptedEvents: EncryptedIcsImportEvent[] = [];
      for (const event of parsed.events) {
        const { sourceUid, occurrenceDate, excludedDates, ...content } = event;
        const payload = await this.e2ee.attachEventEncryptionShadow({ ...content, calendarId: request.calendarId });
        const externalId = await this.icsImportId(JSON.stringify([sourceUid, occurrenceDate ?? null]));
        // Zod checked it; apps/web's non-strict build infers its keys as optional.
        encryptedEvents.push(encryptedIcsImportEventSchema.parse({
          externalId,
          seriesExternalId: occurrenceDate ? await this.icsImportId(JSON.stringify([sourceUid, null])) : undefined,
          occurrenceDate, excludedDates,
          start: content.start, end: content.end, allDay: Boolean(content.allDay), timezone: content.timezone,
          recurrence: content.recurrence, participants: content.participants,
          encryptedContent: payload.encryptedContent, blindIndexTokens: payload.blindIndexTokens,
          encryptionKeyVersion: payload.encryptionKeyVersion,
        }) as EncryptedIcsImportEvent);
      }
      encryptedEvents.sort((left, right) => Number(Boolean(left.seriesExternalId)) - Number(Boolean(right.seriesExternalId)));
      let eventsCreated = 0;
      const errors = [...parsed.errors];
      for (let offset = 0; offset < encryptedEvents.length; offset += 100) {
        const result = await this.client.post<Schema<"ImportIcsResponse">>("/api/subscriptions/import-ics", {
          calendarId: request.calendarId, encryptedEvents: encryptedEvents.slice(offset, offset + 100),
        } satisfies Schema<"EncryptedIcsImportRequest">);
        eventsCreated += result.eventsCreated;
        errors.push(...(result.errors ?? []));
      }
      return { success: true, eventsCreated, eventsTotal: parsed.eventsTotal,
        calendarName: parsed.calendarName, fileName: request.fileName,
        ...(errors.length ? { errors } : {}),
      };
    } catch (error) {
      throw this.transformError(error, "Failed to import ICS file");
    }
  }

  private async icsImportId(value: string): Promise<string> {
    // Fixed-width hex preserves the entire UID as one keyed token without exposing it to the server.
    const encoded = Array.from(value, (character) => character.codePointAt(0)?.toString(16).padStart(6, "0") ?? "").join("");
    const [token] = await this.e2ee.createBlindIndexTokens(`icsimport${encoded}`);
    if (!token) throw new Error("Unlock your account before importing a calendar");
    return token;
  }

  // ─── Subscriptions ───────────────────────────────────────────────────────────

  async getSubscriptions(): Promise<CalendarSubscription[]> {
    try {
      return (await this.client.get<Schema<"CalendarSubscription">[]>(
        "/api/subscriptions",
      )) as CalendarSubscription[];
    } catch (error) {
      throw this.transformError(error, "Failed to load subscriptions");
    }
  }

  async createSubscription(
    request: CreateSubscriptionRequest,
  ): Promise<Omit<CalendarSubscription, "_count">> {
    try {
      return (await this.client.post<Schema<"CalendarSubscription">>(
        "/api/subscriptions",
        request satisfies Schema<"CreateSubscriptionRequest">,
      )) as Omit<CalendarSubscription, "_count">;
    } catch (error) {
      throw this.transformError(error, "Failed to create subscription");
    }
  }

  async updateSubscription(
    id: string,
    request: UpdateSubscriptionRequest,
  ): Promise<Omit<CalendarSubscription, "_count">> {
    try {
      return (await this.client.put<Schema<"CalendarSubscription">>(
        `/api/subscriptions/${encodeURIComponent(id)}`,
        request satisfies Schema<"UpdateSubscriptionRequest">,
      )) as Omit<CalendarSubscription, "_count">;
    } catch (error) {
      throw this.transformError(error, "Failed to update subscription");
    }
  }

  /** Both apps promise the feed's events go with it; kept events would turn the feed into a writable calendar of plaintext. */
  async deleteSubscription(id: string): Promise<DeleteSubscriptionResponse> {
    try {
      return await this.client.delete<Schema<"DeleteSubscriptionResponse">>(
        `/api/subscriptions/${encodeURIComponent(id)}?deleteEvents=true`,
      );
    } catch (error) {
      throw this.transformError(error, "Failed to delete subscription");
    }
  }

  async syncSubscription(id: string): Promise<SyncSubscriptionResponse> {
    try {
      return (await this.client.post<Schema<"SubscriptionSyncResult">>(
        `/api/subscriptions/${encodeURIComponent(id)}/sync`,
        {},
      )) as SyncSubscriptionResponse;
    } catch (error) {
      throw this.transformError(error, "Failed to sync subscription");
    }
  }

  // ─── Bulk Operations ─────────────────────────────────────────────────────────

  async bulkEventOperation(
    request: BulkEventRequest,
  ): Promise<BulkEventResponse> {
    try {
      return (await this.client.post<Schema<"BulkEventResult">>(
        "/api/events/bulk",
        request satisfies Schema<"BulkEventRequest">,
      )) as BulkEventResponse;
    } catch (error) {
      throw this.transformError(
        error,
        "Failed to perform bulk event operation",
      );
    }
  }

  // ─── Notifications ───────────────────────────────────────────────────────────

  async getEventNotifications(
    eventId: string,
  ): Promise<ApiResponse<"EventNotifications">> {
    try {
      return await this.client.get<Schema<"EventNotifications">>(
        `/api/notifications/event/${encodeURIComponent(eventId)}`,
      );
    } catch (error) {
      throw this.transformError(error, "Failed to get event notifications");
    }
  }

  async updateEventNotifications(
    eventId: string,
    notifications: CreateNotificationRequest["notifications"],
    options?: Pick<CreateNotificationRequest, "encryptedDisplayTitle">,
  ): Promise<Schema<"NotificationUpdateResult">> {
    try {
      // Sealed here so every caller's reminders can show their start on iPhone without the push carrying it.
      const sealed = await Promise.all(
        notifications.map(async (setting) => {
          const encryptedLead = await this.e2ee
            .encryptNotificationLead(eventId, setting.minutesBefore)
            .catch(() => undefined);
          return encryptedLead === undefined
            ? setting
            : { ...setting, encryptedLead };
        }),
      );
      return await this.client.put<Schema<"NotificationUpdateResult">>(
        `/api/notifications/event/${encodeURIComponent(eventId)}`,
        {
          notifications: sealed,
          ...(options?.encryptedDisplayTitle !== undefined
            ? { encryptedDisplayTitle: options.encryptedDisplayTitle }
            : {}),
        } satisfies Schema<"UpdateEventNotificationsRequest">,
      );
    } catch (error) {
      throw this.transformError(error, "Failed to update event notifications");
    }
  }

  async registerPushDevice(
    input: RegisterPushDeviceRequest,
  ): Promise<PushDeviceRegistrationResult> {
    try {
      return await this.client.put<Schema<"PushDeviceRegistration">>(
        "/api/push/devices",
        input satisfies Schema<"RegisterPushDeviceRequest">,
      );
    } catch (error) {
      throw this.transformError(error, "Failed to register push device");
    }
  }

  async listPushDevices(): Promise<ApiResponse<"PushDeviceList">> {
    try {
      return await this.client.get<Schema<"PushDeviceList">>(
        "/api/push/devices",
      );
    } catch (error) {
      throw this.transformError(error, "Failed to list push devices");
    }
  }

  async unregisterPushDevice(
    token?: string,
    headers?: Record<string, string>,
  ): Promise<PushDeviceUnregisterResult> {
    try {
      return await this.client.delete<Schema<"PushDeviceUnregistration">>(
        "/api/push/devices",
        {
          body: JSON.stringify(
            (token ? { token } : {}) satisfies Schema<"UnregisterPushDeviceRequest">,
          ),
          ...(headers ? { headers } : {}),
        },
      );
    } catch (error) {
      throw this.transformError(error, "Failed to unregister push device");
    }
  }

  async sendTestPushNotification(): Promise<PushTestNotificationResult> {
    try {
      return await this.client.post<Schema<"PushTestResult">>(
        "/api/push/test",
        {},
      );
    } catch (error) {
      throw this.transformError(error, "Failed to send test notification");
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
