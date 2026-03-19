import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { calendarApiService } from "./api";
import type {
  ApiError,
  Calendar,
  CalendarEvent,
  CreateCalendarRequest,
  CreateCategoryRequest,
  CreateEventRequest,
  EventCategory,
  EventNotification as ApiEventNotification,
  UpdateCalendarRequest,
  UpdateCategoryRequest,
  UpdateEventRequest,
} from "./types";

export interface CalendarDataNotification {
  id?: string;
  notificationType: "email";
  minutesBefore: number;
  isEnabled: boolean;
}

export interface DateRange {
  start: Date;
  end: Date;
}

function normalizeDateRange(dateRange: DateRange): DateRange {
  const start = startOfWeek(startOfMonth(dateRange.start), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(dateRange.end), { weekStartsOn: 1 });
  return { start, end };
}

export interface UseCalendarDataOptions {
  initialDateRange?: DateRange;
  cacheTimeout?: number;
  autoRefetch?: boolean;
}

export interface UseCalendarDataReturn {
  events: CalendarEvent[];
  calendars: Calendar[];
  categories: EventCategory[];

  loading: boolean;
  eventsLoading: boolean;
  calendarsLoading: boolean;
  categoriesLoading: boolean;

  error: ApiError | null;
  eventsError: ApiError | null;
  calendarsError: ApiError | null;
  categoriesError: ApiError | null;

  refetch: () => Promise<void>;
  refetchEvents: (dateRange?: DateRange) => Promise<void>;
  refetchCalendars: () => Promise<Calendar[]>;
  refetchCategories: () => Promise<void>;

  createEvent: (event: CreateEventRequest) => Promise<CalendarEvent>;
  updateEvent: (
    id: string,
    event: UpdateEventRequest,
  ) => Promise<CalendarEvent>;
  deleteEvent: (id: string) => Promise<void>;
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

  setDateRange: (dateRange: DateRange) => void;
  clearCache: () => void;

  loadNotifications: (eventId: string) => Promise<CalendarDataNotification[]>;
  updateNotifications: (
    eventId: string,
    notifications: CalendarDataNotification[],
  ) => Promise<void>;
}

function validateAndCleanEvents(
  items: CalendarEvent[],
  range: DateRange,
): { cleanedEvents: CalendarEvent[]; issues: string[]; valid: boolean } {
  const seen = new Set<string>();
  const cleaned: CalendarEvent[] = [];
  let duplicates = 0;
  let invalidDates = 0;
  let outOfRange = 0;

  for (const e of items) {
    const start = e.start instanceof Date ? e.start : new Date(e.start);
    const end = e.end instanceof Date ? e.end : new Date(e.end);

    const startOk = !isNaN(start.getTime());
    const endOk = !isNaN(end.getTime());

    if (!startOk || !endOk || start > end) {
      invalidDates++;
      continue;
    }

    const intersects = start <= range.end && end >= range.start;
    if (!intersects) {
      outOfRange++;
      continue;
    }

    if (seen.has(e.id)) {
      duplicates++;
      continue;
    }
    seen.add(e.id);
    cleaned.push({ ...e, start, end });
  }

  const issues: string[] = [];
  if (duplicates) issues.push(`duplicates:${duplicates}`);
  if (invalidDates) issues.push(`invalidDates:${invalidDates}`);
  if (outOfRange) issues.push(`outOfRange:${outOfRange}`);

  return { cleanedEvents: cleaned, issues, valid: invalidDates === 0 };
}

export function useCalendarData(
  options: UseCalendarDataOptions = {},
): UseCalendarDataReturn {
  const {
    initialDateRange,
    cacheTimeout = 5 * 60 * 1000,
    autoRefetch = true,
  } = options;

  const [currentDateRange, setCurrentDateRange] = useState<DateRange | null>(
    initialDateRange || null,
  );

  const queryClient = useQueryClient();

  const calendarsQuery = useQuery({
    queryKey: ["calendars"],
    queryFn: () => calendarApiService.getCalendars(),
    enabled: autoRefetch,
    staleTime: cacheTimeout,
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => calendarApiService.getCategories(),
    enabled: autoRefetch,
    staleTime: cacheTimeout,
  });

  const eventsQuery = useQuery({
    queryKey: ["events", currentDateRange],
    queryFn: async () => {
      if (!currentDateRange) return [];
      const res = await calendarApiService.getEvents(
        currentDateRange.start,
        currentDateRange.end,
      );
      const { cleanedEvents } = validateAndCleanEvents(
        res.events,
        currentDateRange,
      );
      return cleanedEvents;
    },
    enabled: autoRefetch && !!currentDateRange,
    placeholderData: (previousData: CalendarEvent[] | undefined) => previousData,
    staleTime: cacheTimeout,
  });

  const createEventMutation = useMutation({
    mutationFn: (event: CreateEventRequest) =>
      calendarApiService.createEvent(event),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: ({ id, event }: { id: string; event: UpdateEventRequest }) =>
      calendarApiService.updateEvent(id, event),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: (id: string) => calendarApiService.deleteEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  const createCalendarMutation = useMutation({
    mutationFn: (calendar: CreateCalendarRequest) =>
      calendarApiService.createCalendar(calendar),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendars"] });
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
      queryClient.invalidateQueries({ queryKey: ["calendars"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
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
      queryClient.invalidateQueries({ queryKey: ["calendars"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: (category: CreateCategoryRequest) =>
      calendarApiService.createCategory(category),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
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
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => calendarApiService.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  const refetchEvents = useCallback(
    async (dateRange?: DateRange) => {
      if (dateRange) {
        setCurrentDateRange(dateRange);
      } else {
        await eventsQuery.refetch();
      }
    },
    [eventsQuery],
  );

  const refetchCalendars = useCallback(async () => {
    const res = await calendarsQuery.refetch();
    return res.data || [];
  }, [calendarsQuery]);

  const refetchCategories = useCallback(async () => {
    await categoriesQuery.refetch();
  }, [categoriesQuery]);

  const refetch = useCallback(async () => {
    await Promise.all([
      eventsQuery.refetch(),
      calendarsQuery.refetch(),
      categoriesQuery.refetch(),
    ]);
  }, [eventsQuery, calendarsQuery, categoriesQuery]);

  const clearCache = useCallback(() => {
    queryClient.invalidateQueries();
    queryClient.clear();
  }, [queryClient]);

  const setDateRange = useCallback((dateRange: DateRange) => {
    const normalized = normalizeDateRange(dateRange);
    setCurrentDateRange((prev) => {
      if (
        prev &&
        prev.start.getTime() === normalized.start.getTime() &&
        prev.end.getTime() === normalized.end.getTime()
      ) {
        return prev;
      }
      return normalized;
    });
  }, []);

  const loadNotifications = useCallback(async (eventId: string) => {
    try {
      const response = await calendarApiService.getEventNotifications(eventId);
      return response.data.notifications
        .filter((n: ApiEventNotification) => n.notificationType === "email")
        .map((n: ApiEventNotification) => ({
          id: n.id,
          notificationType: "email" as const,
          minutesBefore: n.minutesBefore,
          isEnabled: n.isEnabled,
        }));
    } catch {
      return [];
    }
  }, []);

  const updateNotifications = useCallback(
    async (eventId: string, notifications: CalendarDataNotification[]) => {
      const notificationData = notifications.map((n) => ({
        notificationType: n.notificationType,
        minutesBefore: n.minutesBefore,
        isEnabled: n.isEnabled,
      }));
      await calendarApiService.updateEventNotifications(eventId, notificationData);
    },
    [],
  );

  return {
    events: eventsQuery.data || [],
    calendars: calendarsQuery.data || [],
    categories: categoriesQuery.data || [],

    loading:
      eventsQuery.isLoading ||
      calendarsQuery.isLoading ||
      categoriesQuery.isLoading,
    eventsLoading: eventsQuery.isLoading,
    calendarsLoading: calendarsQuery.isLoading,
    categoriesLoading: categoriesQuery.isLoading,

    error: (eventsQuery.error ||
      calendarsQuery.error ||
      categoriesQuery.error) as unknown as ApiError | null,
    eventsError: eventsQuery.error as unknown as ApiError | null,
    calendarsError: calendarsQuery.error as unknown as ApiError | null,
    categoriesError: categoriesQuery.error as unknown as ApiError | null,

    refetch,
    refetchEvents,
    refetchCalendars,
    refetchCategories,

    createEvent: (event) => createEventMutation.mutateAsync(event),
    updateEvent: (id, event) => updateEventMutation.mutateAsync({ id, event }),
    deleteEvent: async (id) => {
      await deleteEventMutation.mutateAsync(id);
    },
    createCalendar: (calendar) => createCalendarMutation.mutateAsync(calendar),
    updateCalendar: (id, calendar) =>
      updateCalendarMutation.mutateAsync({ id, calendar }),
    deleteCalendar: async (id, action = "delete_events", targetCalendarId) => {
      await deleteCalendarMutation.mutateAsync({
        id,
        action,
        targetCalendarId,
      });
    },
    createCategory: (category) => createCategoryMutation.mutateAsync(category),
    updateCategory: (id, category) =>
      updateCategoryMutation.mutateAsync({ id, category }),
    deleteCategory: async (id) => {
      await deleteCategoryMutation.mutateAsync(id);
    },

    setDateRange,
    clearCache,

    loadNotifications,
    updateNotifications,
  };
}
