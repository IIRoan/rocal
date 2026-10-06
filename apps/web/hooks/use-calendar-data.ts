import { useCallback, useMemo } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { createLogger } from "@workspace/logger";
import { calendarApiService } from "../lib/calendar-api-service";
import { encryptReminderTitle } from "../lib/e2ee-notification-title";
import {
  CalendarEvent,
  Calendar,
  EventCategory,
  CreateEventRequest,
  UpdateEventRequest,
  CreateCalendarRequest,
  UpdateCalendarRequest,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  ApiError,
  EventNotification as ApiEventNotification,
} from "../lib/types/calendar";
import { EventNotification } from "@workspace/ui/components/calendar";
import {
  CALENDARS_QUERY_KEY,
  CATEGORIES_QUERY_KEY,
  invitationByExternalIdQueryKey,
  isRecurringSeriesMember,
  resolveRecurringEventTarget,
  shiftRecurringSeriesTimes,
  toRecurringEventUpdates,
  type RecurrenceDeleteScope,
  type RecurrenceEditScope,
} from "@workspace/calendar-core";
import {
  useCalendarEventsLoader,
  EVENTS_QUERY_KEY,
  getMonthQueryKey,
  monthKey,
  type DateRange,
} from "./use-calendar-events-loader";

const log = createLogger("calendar-data");

export interface EditRecurringEventInput {
  /** The event as it was before the edit, so the original occurrence date is used. */
  event: CalendarEvent;
  scope: RecurrenceEditScope;
  updates: UpdateEventRequest;
}

export interface DeleteRecurringEventInput {
  event: CalendarEvent;
  scope: RecurrenceDeleteScope;
}

type EventCacheSnapshot = Array<[QueryKey, CalendarEvent[] | undefined]>;

function hasRecurrence(
  event: { recurrence?: string | null } | null | undefined,
): boolean {
  return Boolean(event?.recurrence);
}

export function findEventInCache(
  queryClient: QueryClient,
  id: string,
): CalendarEvent | null {
  const entries = queryClient.getQueriesData<CalendarEvent[]>({
    queryKey: EVENTS_QUERY_KEY,
  });
  for (const [, events] of entries) {
    if (!Array.isArray(events)) continue;
    for (const event of events) {
      if (event.id === id) return event;
    }
  }
  return null;
}

async function snapshotEventCache(
  queryClient: QueryClient,
): Promise<EventCacheSnapshot> {
  await queryClient.cancelQueries({ queryKey: EVENTS_QUERY_KEY });
  return queryClient.getQueriesData<CalendarEvent[]>({
    queryKey: EVENTS_QUERY_KEY,
  });
}

function restoreEventCache(
  queryClient: QueryClient,
  snapshot: EventCacheSnapshot | undefined,
) {
  for (const [key, data] of snapshot ?? []) {
    queryClient.setQueryData(key, data);
  }
}

function mapCachedEvents(
  queryClient: QueryClient,
  map: (events: CalendarEvent[]) => CalendarEvent[],
) {
  queryClient.setQueriesData<CalendarEvent[]>(
    { queryKey: EVENTS_QUERY_KEY },
    (events) => (Array.isArray(events) ? map(events) : events),
  );
}

function toContentPatch(updates: UpdateEventRequest): Partial<CalendarEvent> {
  const patch: Partial<CalendarEvent> = {};
  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.description !== undefined) {
    patch.description = updates.description;
  }
  if (updates.location !== undefined) patch.location = updates.location;
  if (updates.calendarId !== undefined) patch.calendarId = updates.calendarId;
  if (updates.categoryId !== undefined) {
    patch.categoryId = updates.categoryId || null;
  }
  return patch;
}

function toOccurrencePatch(
  updates: UpdateEventRequest,
): Partial<CalendarEvent> {
  const patch = toContentPatch(updates);
  if (updates.start) patch.start = new Date(updates.start);
  if (updates.end) patch.end = new Date(updates.end);
  if (updates.allDay !== undefined) patch.allDay = updates.allDay;
  return patch;
}

function isAtOrAfter(event: CalendarEvent, instant: Date | string) {
  return new Date(event.start).getTime() >= new Date(instant).getTime();
}

function isAffectedByScope(
  candidate: CalendarEvent,
  event: CalendarEvent,
  scope: RecurrenceEditScope | RecurrenceDeleteScope,
): boolean {
  if (candidate.id === event.id) return true;
  if (scope === "this_only") return false;
  const target = resolveRecurringEventTarget(event);
  if (!target || !isRecurringSeriesMember(candidate, target.parentEventId)) {
    return false;
  }
  return scope === "all" || isAtOrAfter(candidate, event.start);
}

export async function persistRecurringEventEdit({
  event,
  scope,
  updates,
}: EditRecurringEventInput): Promise<CalendarEvent> {
  const target = resolveRecurringEventTarget(event);
  if (!target) return calendarApiService.updateEvent(event.id, updates);
  if (scope === "this_only" && target.detachedEventId) {
    return calendarApiService.updateEvent(target.detachedEventId, updates);
  }

  let recurringUpdates = toRecurringEventUpdates(updates);
  if (scope === "all" && (recurringUpdates.start || recurringUpdates.end)) {
    const series =
      target.parentEventId === event.id
        ? event
        : await calendarApiService.getEvent(target.parentEventId);
    const { start, end, ...rest } = recurringUpdates;
    recurringUpdates = {
      ...rest,
      ...shiftRecurringSeriesTimes({
        series,
        occurrence: event,
        next: { start, end },
        timezone: updates.timezone ?? series.timezone,
      }),
    };
  }

  return calendarApiService.editRecurringEvent(target.parentEventId, {
    editScope: scope,
    occurrenceDate: scope === "all" ? undefined : target.occurrenceDate,
    updates: recurringUpdates,
  });
}

export async function persistRecurringEventDelete({
  event,
  scope,
}: DeleteRecurringEventInput): Promise<void> {
  const target = resolveRecurringEventTarget(event);
  if (!target) {
    await calendarApiService.deleteEvent(event.id);
    return;
  }
  if (scope === "this_only" && target.detachedEventId) {
    await calendarApiService.deleteEvent(target.detachedEventId);
    return;
  }
  await calendarApiService.deleteRecurringEvent(
    target.parentEventId,
    scope,
    scope === "all" ? undefined : target.occurrenceDate,
  );
}

export function invalidateEventRanges(
  queryClient: QueryClient,
  start?: Date | string | null,
  end?: Date | string | null,
) {
  if (!start) {
    queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY });
    return;
  }
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : startDate;
  const months = new Set<string>();
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  while (cursor <= endDate) {
    months.add(monthKey(cursor));
    // repo-rules-allow timezone-safe-calendar-code: wall-clock month-key enumeration, matching monthKey's local getters, not an event instant.
    cursor.setMonth(cursor.getMonth() + 1);
  }
  for (const month of months) {
    queryClient.invalidateQueries({ queryKey: getMonthQueryKey(month) });
  }
}

interface UseCalendarDataOptions {
  cacheTimeout?: number;
  autoRefetch?: boolean;
}

export interface UseCalendarDataReturn {
  // Data
  events: CalendarEvent[];
  calendars: Calendar[];
  categories: EventCategory[];

  // Loading states
  loading: boolean;
  eventsLoading: boolean;
  calendarsLoading: boolean;
  categoriesLoading: boolean;

  // Error states
  error: ApiError | null;
  eventsError: ApiError | null;
  calendarsError: ApiError | null;
  categoriesError: ApiError | null;

  // Actions
  refetch: () => Promise<void>;
  refetchEvents: (dateRange?: DateRange) => Promise<void>;
  refetchCalendars: () => Promise<Calendar[]>;
  refetchCategories: () => Promise<void>;

  // CRUD operations
  createEvent: (event: CreateEventRequest) => Promise<CalendarEvent>;
  updateEvent: (
    id: string,
    event: UpdateEventRequest,
  ) => Promise<CalendarEvent>;
  deleteEvent: (id: string) => Promise<void>;
  editRecurringEvent: (input: EditRecurringEventInput) => Promise<CalendarEvent>;
  deleteRecurringEvent: (input: DeleteRecurringEventInput) => Promise<void>;
  createCalendar: (calendar: CreateCalendarRequest) => Promise<Calendar>;
  updateCalendar: (
    id: string,
    calendar: UpdateCalendarRequest,
  ) => Promise<Calendar>;
  deleteCalendar: (
    id: string,
    action?: string,
    targetCalendarId?: string,
  ) => Promise<void>;
  createCategory: (category: CreateCategoryRequest) => Promise<EventCategory>;
  updateCategory: (
    id: string,
    category: UpdateCategoryRequest,
  ) => Promise<EventCategory>;
  deleteCategory: (id: string) => Promise<void>;

  // Utility
  setDateRange: (dateRange: DateRange) => void;
  setMonth: (date: Date) => void;
  clearCache: () => void;

  // Mini calendar support
  prefetchRange: (range: DateRange) => void;
  getCachedEventsForRange: (range: DateRange) => CalendarEvent[] | undefined;

  // Notification handlers
  loadNotifications: (eventId: string) => Promise<EventNotification[]>;
  updateNotifications: (
    eventId: string,
    notifications: EventNotification[],
    title?: string | null,
  ) => Promise<void>;
}

export function useCalendarData(
  options: UseCalendarDataOptions = {},
): UseCalendarDataReturn {
  const { cacheTimeout = 5 * 60 * 1000, autoRefetch = true } = options;

  const queryClient = useQueryClient();

  const {
    events,
    eventsLoading,
    eventsError,
    setDateRange,
    setMonth,
    refetchEvents,
    prefetchRange,
    getCachedEventsForRange,
  } = useCalendarEventsLoader({
    cacheTimeout,
    autoRefetch,
    preloadMonthsAhead: 2,
  });

  // --- Queries ---

  const calendarsQuery = useQuery<Calendar[], ApiError>({
    queryKey: CALENDARS_QUERY_KEY,
    queryFn: () => calendarApiService.getCalendars(),
    enabled: autoRefetch,
    staleTime: cacheTimeout,
  });

  const categoriesQuery = useQuery<EventCategory[], ApiError>({
    queryKey: CATEGORIES_QUERY_KEY,
    queryFn: () => calendarApiService.getCategories(),
    enabled: autoRefetch,
    staleTime: cacheTimeout,
  });

  // --- Mutations ---

  const createEventMutation = useMutation({
    mutationFn: (event: CreateEventRequest) =>
      calendarApiService.createEvent(event),
    onSuccess: (_data, variables) => {
      if (hasRecurrence(variables)) {
        queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY });
        return;
      }
      invalidateEventRanges(queryClient, variables.start, variables.end);
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: ({ id, event }: { id: string; event: UpdateEventRequest }) =>
      calendarApiService.updateEvent(id, event),
    onSuccess: (_data, { id, event }) => {
      if (hasRecurrence(event)) {
        queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY });
        return;
      }
      const cached = findEventInCache(queryClient, id);
      if (hasRecurrence(cached)) {
        queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY });
        return;
      }
      if (!cached && (!event.start || !event.end)) {
        queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY });
        return;
      }
      if (cached) {
        invalidateEventRanges(queryClient, cached.start, cached.end);
      }
      if (event.start && event.end) {
        invalidateEventRanges(queryClient, event.start, event.end);
      } else if (event.start || event.end) {
        queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY });
      }
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: (id: string) => calendarApiService.deleteEvent(id),
    onSuccess: (_data, id) => {
      const cached = findEventInCache(queryClient, id);
      if (cached?.externalId) {
        void queryClient.invalidateQueries({
          queryKey: invitationByExternalIdQueryKey(cached.externalId),
        });
      }
      if (!cached) {
        queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY });
        return;
      }
      if (hasRecurrence(cached)) {
        queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY });
        return;
      }
      invalidateEventRanges(queryClient, cached.start, cached.end);
    },
  });

  const editRecurringEventMutation = useMutation({
    mutationFn: persistRecurringEventEdit,
    onMutate: async ({ event, scope, updates }) => {
      const snapshot = await snapshotEventCache(queryClient);
      const occurrencePatch = toOccurrencePatch(updates);
      const seriesPatch = toContentPatch(updates);
      mapCachedEvents(queryClient, (events) =>
        events.map((candidate) => {
          if (candidate.id === event.id) {
            return { ...candidate, ...occurrencePatch };
          }
          return isAffectedByScope(candidate, event, scope)
            ? { ...candidate, ...seriesPatch }
            : candidate;
        }),
      );
      return { snapshot };
    },
    onError: (_error, _input, context) => {
      restoreEventCache(queryClient, context?.snapshot);
    },
    onSettled: (_data, _error, { event, scope, updates }) => {
      if (scope !== "this_only") {
        queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY });
        return;
      }
      invalidateEventRanges(queryClient, event.start, event.end);
      if (updates.start) {
        invalidateEventRanges(queryClient, updates.start, updates.end);
      }
    },
  });

  const deleteRecurringEventMutation = useMutation({
    mutationFn: persistRecurringEventDelete,
    onMutate: async ({ event, scope }) => {
      const snapshot = await snapshotEventCache(queryClient);
      mapCachedEvents(queryClient, (events) =>
        events.filter(
          (candidate) => !isAffectedByScope(candidate, event, scope),
        ),
      );
      return { snapshot };
    },
    onError: (_error, _input, context) => {
      restoreEventCache(queryClient, context?.snapshot);
    },
    onSettled: (_data, _error, { event, scope }) => {
      if (scope === "this_only") {
        invalidateEventRanges(queryClient, event.start, event.end);
        return;
      }
      queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY });
    },
  });

  const createCalendarMutation = useMutation({
    mutationFn: (calendar: CreateCalendarRequest) =>
      calendarApiService.createCalendar(calendar),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CALENDARS_QUERY_KEY });
      // Invalidate events too — new calendars (e.g. holiday) may have events
      queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY });
    },
  });

  const updateCalendarMutation = useMutation({
    mutationFn: ({
      id,
      calendar,
    }: {
      id: string;
      calendar: UpdateCalendarRequest;
    }) => calendarApiService.updateCalendar(id, calendar),
    onSuccess: () => {
      // Only refresh calendar metadata — visibility/name/color changes don't alter server-side events, so there is no need to re-fetch events here.
      queryClient.invalidateQueries({ queryKey: CALENDARS_QUERY_KEY });
    },
  });

  const deleteCalendarMutation = useMutation({
    mutationFn: ({
      id,
      action,
      targetCalendarId,
    }: {
      id: string;
      action?: string;
      targetCalendarId?: string;
    }) =>
      calendarApiService.deleteCalendarAdvanced(id, action, targetCalendarId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CALENDARS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY });
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: (category: CreateCategoryRequest) =>
      calendarApiService.createCategory(category),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({
      id,
      category,
    }: {
      id: string;
      category: UpdateCategoryRequest;
    }) => calendarApiService.updateCategory(id, category),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => calendarApiService.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY });
    },
  });

  // --- Actions ---

  const refetchCalendars = useCallback(async () => {
    const res = await calendarsQuery.refetch();
    return res.data || [];
  }, [calendarsQuery]);

  const refetchCategories = useCallback(async () => {
    await categoriesQuery.refetch();
  }, [categoriesQuery]);

  const refetch = useCallback(async () => {
    await Promise.all([
      refetchEvents(),
      calendarsQuery.refetch(),
      categoriesQuery.refetch(),
    ]);
  }, [refetchEvents, calendarsQuery, categoriesQuery]);

  const clearCache = useCallback(() => {
    queryClient.clear();
  }, [queryClient]);

  // --- Notification Handlers ---

  const loadNotifications = useCallback(async (eventId: string) => {
    try {
      const response = await calendarApiService.getEventNotifications(eventId);
      return response.data.notifications.flatMap((n: ApiEventNotification) =>
        n.notificationType === "email"
          ? [
              {
                id: n.id,
                notificationType: "email" as const,
                minutesBefore: n.minutesBefore,
                isEnabled: n.isEnabled,
              },
            ]
          : [],
      );
    } catch (error) {
      log.error("Failed to load event notifications:", error);
      return [];
    }
  }, []);

  const updateNotifications = useCallback(
    async (
      eventId: string,
      notifications: EventNotification[],
      title?: string | null,
    ) => {
      try {
        const notificationData = notifications.map((n) => ({
          notificationType: n.notificationType,
          minutesBefore: n.minutesBefore,
          isEnabled: n.isEnabled,
        }));
        await calendarApiService.updateEventNotifications(
          eventId,
          notificationData,
          {
            // undefined keeps the stored ciphertext, null clears it.
            encryptedDisplayTitle:
              title === undefined
                ? undefined
                : await encryptReminderTitle(eventId, title),
          },
        );
      } catch (error) {
        log.error("Failed to update event notifications:", error);
        throw error;
      }
    },
    [],
  );

  const createEvent = useCallback(
    (event: CreateEventRequest) => createEventMutation.mutateAsync(event),
    [createEventMutation],
  );

  const updateEvent = useCallback(
    (id: string, event: UpdateEventRequest) =>
      updateEventMutation.mutateAsync({ id, event }),
    [updateEventMutation],
  );

  const deleteEvent = useCallback(
    async (id: string) => {
      await deleteEventMutation.mutateAsync(id);
    },
    [deleteEventMutation],
  );

  const editRecurringEvent = useCallback(
    (input: EditRecurringEventInput) =>
      editRecurringEventMutation.mutateAsync(input),
    [editRecurringEventMutation],
  );

  const deleteRecurringEvent = useCallback(
    async (input: DeleteRecurringEventInput) => {
      await deleteRecurringEventMutation.mutateAsync(input);
    },
    [deleteRecurringEventMutation],
  );

  const createCalendar = useCallback(
    (calendar: CreateCalendarRequest) =>
      createCalendarMutation.mutateAsync(calendar),
    [createCalendarMutation],
  );

  const updateCalendar = useCallback(
    (id: string, calendar: UpdateCalendarRequest) =>
      updateCalendarMutation.mutateAsync({ id, calendar }),
    [updateCalendarMutation],
  );

  const deleteCalendar = useCallback(
    async (
      id: string,
      action = "delete_events",
      targetCalendarId?: string,
    ) => {
      await deleteCalendarMutation.mutateAsync({
        id,
        action,
        targetCalendarId,
      });
    },
    [deleteCalendarMutation],
  );

  const createCategory = useCallback(
    (category: CreateCategoryRequest) =>
      createCategoryMutation.mutateAsync(category),
    [createCategoryMutation],
  );

  const updateCategory = useCallback(
    (id: string, category: UpdateCategoryRequest) =>
      updateCategoryMutation.mutateAsync({ id, category }),
    [updateCategoryMutation],
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      await deleteCategoryMutation.mutateAsync(id);
    },
    [deleteCategoryMutation],
  );

  return useMemo(
    () => ({
      // Data
      events,
      calendars: calendarsQuery.data || [],
      categories: categoriesQuery.data || [],

      // Loading states
      loading:
        eventsLoading ||
        calendarsQuery.isLoading ||
        categoriesQuery.isLoading,
      eventsLoading,
      calendarsLoading: calendarsQuery.isLoading,
      categoriesLoading: categoriesQuery.isLoading,

      // Error states
      error: eventsError || calendarsQuery.error || categoriesQuery.error,
      eventsError,
      calendarsError: calendarsQuery.error,
      categoriesError: categoriesQuery.error,

      // Actions
      refetch,
      refetchEvents,
      refetchCalendars,
      refetchCategories,

      // CRUD operations
      createEvent,
      updateEvent,
      deleteEvent,
      editRecurringEvent,
      deleteRecurringEvent,
      createCalendar,
      updateCalendar,
      deleteCalendar,
      createCategory,
      updateCategory,
      deleteCategory,

      // Utility
      setDateRange,
      setMonth,
      clearCache,

      // Mini calendar support
      prefetchRange,
      getCachedEventsForRange,

      // Notification handlers
      loadNotifications,
      updateNotifications,
    }),
    [
      events,
      calendarsQuery.data,
      calendarsQuery.isLoading,
      calendarsQuery.error,
      categoriesQuery.data,
      categoriesQuery.isLoading,
      categoriesQuery.error,
      eventsLoading,
      eventsError,
      refetch,
      refetchEvents,
      refetchCalendars,
      refetchCategories,
      createEvent,
      updateEvent,
      deleteEvent,
      editRecurringEvent,
      deleteRecurringEvent,
      createCalendar,
      updateCalendar,
      deleteCalendar,
      createCategory,
      updateCategory,
      deleteCategory,
      setDateRange,
      setMonth,
      clearCache,
      prefetchRange,
      getCachedEventsForRange,
      loadNotifications,
      updateNotifications,
    ],
  );
}
