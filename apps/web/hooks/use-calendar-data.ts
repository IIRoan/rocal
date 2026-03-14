import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { calendarApiService } from "../lib/calendar-api-service";
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
import { EventNotification } from "@workspace/ui/components/calendar/notification-manager";

interface DateRange {
  start: Date;
  end: Date;
}

function normalizeDateRange(dateRange: DateRange): DateRange {
  const start = startOfWeek(startOfMonth(dateRange.start), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(dateRange.end), { weekStartsOn: 1 });
  return { start, end };
}

interface UseCalendarDataOptions {
  initialDateRange?: DateRange;
  cacheTimeout?: number; // kept for compatibility, handled by React Query staleTime
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
    event: UpdateEventRequest
  ) => Promise<CalendarEvent>;
  deleteEvent: (id: string) => Promise<void>;
  createCalendar: (calendar: CreateCalendarRequest) => Promise<Calendar>;
  updateCalendar: (
    id: string,
    calendar: UpdateCalendarRequest
  ) => Promise<Calendar>;
  deleteCalendar: (id: string, action?: string, targetCalendarId?: string) => Promise<void>;
  createCategory: (category: CreateCategoryRequest) => Promise<EventCategory>;
  updateCategory: (
    id: string,
    category: UpdateCategoryRequest
  ) => Promise<EventCategory>;
  deleteCategory: (id: string) => Promise<void>;

  // Utility
  setDateRange: (dateRange: DateRange) => void;
  clearCache: () => void;

  // Notification handlers
  loadNotifications: (eventId: string) => Promise<EventNotification[]>;
  updateNotifications: (
    eventId: string,
    notifications: EventNotification[]
  ) => Promise<void>;
}

// Validate and clean events: remove duplicates, drop invalid/out-of-range
function validateAndCleanEvents(
  items: CalendarEvent[],
  range: DateRange
): { cleanedEvents: CalendarEvent[]; issues: string[]; valid: boolean } {
  const seen = new Set<string>();
  const cleaned: CalendarEvent[] = [];
  let duplicates = 0;
  let invalidDates = 0;
  let outOfRange = 0;

  for (const e of items) {
    // Ensure dates are Date objects (TanStack Query might return serialized dates if not handled)
    // The API service handles this, but good to be safe
    const start = e.start instanceof Date ? e.start : new Date(e.start);
    const end = e.end instanceof Date ? e.end : new Date(e.end);

    const startOk = !isNaN(start.getTime());
    const endOk = !isNaN(end.getTime());

    if (!startOk || !endOk || start > end) {
      invalidDates++;
      continue;
    }

    // Accept events that intersect the requested range
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
  options: UseCalendarDataOptions = {}
): UseCalendarDataReturn {
  const {
    initialDateRange,
    cacheTimeout = 5 * 60 * 1000,
    autoRefetch = true,
  } = options;

  const [currentDateRange, setCurrentDateRange] = useState<DateRange | null>(
    initialDateRange || null
  );

  const queryClient = useQueryClient();

  // --- Queries ---

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
        currentDateRange.end
      );
      const { cleanedEvents } = validateAndCleanEvents(
        res.events,
        currentDateRange
      );
      return cleanedEvents;
    },
    enabled: autoRefetch && !!currentDateRange,
    placeholderData: (previousData: CalendarEvent[] | undefined) =>
      previousData,
    staleTime: cacheTimeout,
  });

  // --- Mutations ---

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
    },
  });

  const deleteCalendarMutation = useMutation({
    mutationFn: ({ id, action, targetCalendarId }: { id: string; action?: string; targetCalendarId?: string }) =>
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

  // --- Actions ---

  const refetchEvents = useCallback(
    async (dateRange?: DateRange) => {
      if (dateRange) {
        setCurrentDateRange(dateRange);
        // The query will automatically refetch when currentDateRange changes
      } else {
        await eventsQuery.refetch();
      }
    },
    [eventsQuery]
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

  // --- Notification Handlers ---

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
    } catch (error) {
      console.error("Failed to load event notifications:", error);
      return [];
    }
  }, []);

  const updateNotifications = useCallback(
    async (eventId: string, notifications: EventNotification[]) => {
      try {
        const notificationData = notifications.map((n) => ({
          notificationType: n.notificationType,
          minutesBefore: n.minutesBefore,
          isEnabled: n.isEnabled,
        }));
        await calendarApiService.updateEventNotifications(
          eventId,
          notificationData
        );
      } catch (error) {
        console.error("Failed to update event notifications:", error);
        throw error;
      }
    },
    []
  );

  return {
    // Data
    events: eventsQuery.data || [],
    calendars: calendarsQuery.data || [],
    categories: categoriesQuery.data || [],

    // Loading states
    loading:
      eventsQuery.isLoading ||
      calendarsQuery.isLoading ||
      categoriesQuery.isLoading,
    eventsLoading: eventsQuery.isLoading,
    calendarsLoading: calendarsQuery.isLoading,
    categoriesLoading: categoriesQuery.isLoading,

    // Error states
    error: (eventsQuery.error ||
      calendarsQuery.error ||
      categoriesQuery.error) as unknown as ApiError | null,
    eventsError: eventsQuery.error as unknown as ApiError | null,
    calendarsError: calendarsQuery.error as unknown as ApiError | null,
    categoriesError: categoriesQuery.error as unknown as ApiError | null,

    // Actions
    refetch,
    refetchEvents,
    refetchCalendars,
    refetchCategories,

    // CRUD operations
    createEvent: (event) => createEventMutation.mutateAsync(event),
    updateEvent: (id, event) => updateEventMutation.mutateAsync({ id, event }),
    deleteEvent: async (id) => {
      await deleteEventMutation.mutateAsync(id);
    },
    createCalendar: (calendar) => createCalendarMutation.mutateAsync(calendar),
    updateCalendar: (id, calendar) =>
      updateCalendarMutation.mutateAsync({ id, calendar }),
    deleteCalendar: async (id, action = "delete_events", targetCalendarId) => {
      await deleteCalendarMutation.mutateAsync({ id, action, targetCalendarId });
    },
    createCategory: (category) => createCategoryMutation.mutateAsync(category),
    updateCategory: (id, category) =>
      updateCategoryMutation.mutateAsync({ id, category }),
    deleteCategory: async (id) => {
      await deleteCategoryMutation.mutateAsync(id);
    },

    // Utility
    setDateRange,
    clearCache,

    // Notification handlers
    loadNotifications,
    updateNotifications,
  };
}
