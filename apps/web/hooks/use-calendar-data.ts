import { useState, useEffect, useCallback, useRef } from "react";
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
} from "../lib/types/calendar";

// Types for optimistic updates
interface OptimisticOperation {
  id: string;
  type: "create" | "update" | "delete";
  entityType: "event" | "category";
  originalData?: any;
  rollback: () => void;
}

interface DateRange {
  start: Date;
  end: Date;
}

interface CacheEntry {
  data: CalendarEvent[];
  timestamp: number;
  dateRange: DateRange;
}

interface UseCalendarDataOptions {
  initialDateRange?: DateRange;
  cacheTimeout?: number; // in milliseconds
  autoRefetch?: boolean;
}

interface UseCalendarDataReturn {
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
  refetchCalendars: () => Promise<void>;
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
  deleteCalendar: (id: string) => Promise<void>;
  createCategory: (category: CreateCategoryRequest) => Promise<EventCategory>;
  updateCategory: (
    id: string,
    category: UpdateCategoryRequest
  ) => Promise<EventCategory>;
  deleteCategory: (id: string) => Promise<void>;

  // Utility
  setDateRange: (dateRange: DateRange) => void;
  clearCache: () => void;
}

const DEFAULT_CACHE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export function useCalendarData(
  options: UseCalendarDataOptions = {}
): UseCalendarDataReturn {
  const {
    initialDateRange,
    cacheTimeout = DEFAULT_CACHE_TIMEOUT,
    autoRefetch = true,
  } = options;

  // State
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [currentDateRange, setCurrentDateRange] = useState<DateRange | null>(
    initialDateRange || null
  );

  // Loading states
  const [eventsLoading, setEventsLoading] = useState(false);
  const [calendarsLoading, setCalendarsLoading] = useState(false);
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  // Error states
  const [eventsError, setEventsError] = useState<ApiError | null>(null);
  const [calendarsError, setCalendarsError] = useState<ApiError | null>(null);
  const [categoriesError, setCategoriesError] = useState<ApiError | null>(null);

  // Cache
  const eventsCache = useRef<Map<string, CacheEntry>>(new Map());
  const calendarsCache = useRef<{
    data: Calendar[];
    timestamp: number;
  } | null>(null);
  const categoriesCache = useRef<{
    data: EventCategory[];
    timestamp: number;
  } | null>(null);

  // Optimistic operations tracking
  const optimisticOperations = useRef<Map<string, OptimisticOperation>>(
    new Map()
  );
  const operationCounter = useRef<number>(0);

  // Helper functions for optimistic updates
  const generateOptimisticId = useCallback((): string => {
    return `optimistic_${++operationCounter.current}_${Date.now()}`;
  }, []);

  const createOptimisticEvent = useCallback(
    (event: CreateEventRequest): CalendarEvent => {
      return {
        id: generateOptimisticId(),
        title: event.title,
        description: event.description || null,
        start: new Date(event.start),
        end: new Date(event.end),
        allDay: event.allDay || false,
        location: event.location || null,
        color: event.color || null,
        calendarId: event.calendarId,
        calendar: calendars.find((c) => c.id === event.calendarId) || null,
        categoryId: event.categoryId || null,
        category: event.categoryId
          ? categories.find((c) => c.id === event.categoryId) || null
          : null,
        userId: "current_user", // Will be replaced by server response
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
    [generateOptimisticId, calendars, categories]
  );

  const createOptimisticCategory = useCallback(
    (category: CreateCategoryRequest): EventCategory => {
      return {
        id: generateOptimisticId(),
        name: category.name,
        color: category.color,
        isActive: true,
        userId: "current_user", // Will be replaced by server response
        usageCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
    [generateOptimisticId]
  );

  const rollbackOperation = useCallback((operationId: string): void => {
    const operation = optimisticOperations.current.get(operationId);
    if (operation) {
      operation.rollback();
      optimisticOperations.current.delete(operationId);
    }
  }, []);

  const cleanupOperation = useCallback((operationId: string): void => {
    optimisticOperations.current.delete(operationId);
  }, []);

  // Utility function to generate cache key
  const getCacheKey = useCallback((dateRange: DateRange): string => {
    return `${dateRange.start.toISOString()}-${dateRange.end.toISOString()}`;
  }, []);

  // Check if cache entry is valid
  const isCacheValid = useCallback(
    (timestamp: number): boolean => {
      return Date.now() - timestamp < cacheTimeout;
    },
    [cacheTimeout]
  );

  // Check if date range overlaps with cached range
  const isDateRangeOverlapping = useCallback(
    (requestedRange: DateRange, cachedRange: DateRange): boolean => {
      return (
        requestedRange.start <= cachedRange.end &&
        requestedRange.end >= cachedRange.start
      );
    },
    []
  );

  // Find cached data that covers the requested date range
  const findCachedEvents = useCallback(
    (dateRange: DateRange): CalendarEvent[] | null => {
      for (const [, entry] of eventsCache.current) {
        if (
          isCacheValid(entry.timestamp) &&
          isDateRangeOverlapping(dateRange, entry.dateRange) &&
          dateRange.start >= entry.dateRange.start &&
          dateRange.end <= entry.dateRange.end
        ) {
          // Filter events to the requested range
          return entry.data.filter(
            (event) =>
              event.start >= dateRange.start && event.start <= dateRange.end
          );
        }
      }
      return null;
    },
    [isCacheValid, isDateRangeOverlapping]
  );

  // Fetch events with caching
  const fetchEvents = useCallback(
    async (dateRange: DateRange): Promise<void> => {
      setEventsLoading(true);
      setEventsError(null);

      try {
        // Check cache first
        const cachedEvents = findCachedEvents(dateRange);
        if (cachedEvents) {
          setEvents(cachedEvents);
          setEventsLoading(false);
          return;
        }

        // Fetch from API
        const response = await calendarApiService.getEvents(
          dateRange.start,
          dateRange.end
        );

        // Update cache
        const cacheKey = getCacheKey(dateRange);
        eventsCache.current.set(cacheKey, {
          data: response.events,
          timestamp: Date.now(),
          dateRange,
        });

        // Update state
        setEvents(response.events);

        // Update categories if included in response
        if (response.categories) {
          setCategories(response.categories);
          categoriesCache.current = {
            data: response.categories,
            timestamp: Date.now(),
          };
        }

        // Update calendars if included in response
        if (response.calendars) {
          setCalendars(response.calendars);
          calendarsCache.current = {
            data: response.calendars,
            timestamp: Date.now(),
          };
        }
      } catch (error) {
        setEventsError(error as ApiError);
        setEvents([]);
      } finally {
        setEventsLoading(false);
      }
    },
    [findCachedEvents, getCacheKey]
  );

  // Fetch calendars with caching
  const fetchCalendars = useCallback(async (): Promise<void> => {
    setCalendarsLoading(true);
    setCalendarsError(null);

    try {
      // Check cache first
      if (
        calendarsCache.current &&
        isCacheValid(calendarsCache.current.timestamp)
      ) {
        setCalendars(calendarsCache.current.data);
        setCalendarsLoading(false);
        return;
      }

      // Fetch from API
      const fetchedCalendars = await calendarApiService.getCalendars();

      // Update cache
      calendarsCache.current = {
        data: fetchedCalendars,
        timestamp: Date.now(),
      };

      // Update state
      setCalendars(fetchedCalendars);
    } catch (error) {
      setCalendarsError(error as ApiError);
      setCalendars([]);
    } finally {
      setCalendarsLoading(false);
    }
  }, [isCacheValid]);

  // Fetch categories with caching
  const fetchCategories = useCallback(async (): Promise<void> => {
    setCategoriesLoading(true);
    setCategoriesError(null);

    try {
      // Check cache first
      if (
        categoriesCache.current &&
        isCacheValid(categoriesCache.current.timestamp)
      ) {
        setCategories(categoriesCache.current.data);
        setCategoriesLoading(false);
        return;
      }

      // Fetch from API
      const fetchedCategories = await calendarApiService.getCategories();

      // Update cache
      categoriesCache.current = {
        data: fetchedCategories,
        timestamp: Date.now(),
      };

      // Update state
      setCategories(fetchedCategories);
    } catch (error) {
      setCategoriesError(error as ApiError);
      setCategories([]);
    } finally {
      setCategoriesLoading(false);
    }
  }, [isCacheValid]);

  // Public API functions
  const refetchEvents = useCallback(
    async (dateRange?: DateRange): Promise<void> => {
      const rangeToUse = dateRange || currentDateRange;
      if (!rangeToUse) return;

      // Clear cache for this range
      const cacheKey = getCacheKey(rangeToUse);
      eventsCache.current.delete(cacheKey);

      await fetchEvents(rangeToUse);
    },
    [currentDateRange, getCacheKey, fetchEvents]
  );

  const refetchCalendars = useCallback(async (): Promise<void> => {
    // Clear cache
    calendarsCache.current = null;
    await fetchCalendars();
  }, [fetchCalendars]);

  const refetchCategories = useCallback(async (): Promise<void> => {
    // Clear cache
    categoriesCache.current = null;
    await fetchCategories();
  }, [fetchCategories]);

  const refetch = useCallback(async (): Promise<void> => {
    await Promise.all([refetchEvents(), refetchCalendars(), refetchCategories()]);
  }, [refetchEvents, refetchCalendars, refetchCategories]);

  // CRUD operations with optimistic updates
  const createEvent = useCallback(
    async (event: CreateEventRequest): Promise<CalendarEvent> => {
      // Create optimistic event
      const optimisticEvent = createOptimisticEvent(event);
      const operationId = optimisticEvent.id;

      // Apply optimistic update immediately
      setEvents((prev) => [...prev, optimisticEvent]);

      // Store rollback function
      const rollback = () => {
        setEvents((prev) => prev.filter((e) => e.id !== operationId));
      };

      optimisticOperations.current.set(operationId, {
        id: operationId,
        type: "create",
        entityType: "event",
        rollback,
      });

      try {
        // Make API call
        const newEvent = await calendarApiService.createEvent(event);

        // Replace optimistic event with real event
        setEvents((prev) =>
          prev.map((e) => (e.id === operationId ? newEvent : e))
        );

        // Invalidate relevant cache entries
        eventsCache.current.clear();

        // Clean up operation tracking
        cleanupOperation(operationId);

        return newEvent;
      } catch (error) {
        // Rollback optimistic update on failure
        rollbackOperation(operationId);
        throw error as ApiError;
      }
    },
    [createOptimisticEvent, rollbackOperation, cleanupOperation]
  );

  const updateEvent = useCallback(
    async (id: string, event: UpdateEventRequest): Promise<CalendarEvent> => {
      // Store original event for rollback
      const originalEvent = events.find((e) => e.id === id);
      if (!originalEvent) {
        throw new Error("Event not found");
      }

      const operationId = generateOptimisticId();

      // Create optimistic updated event
      const optimisticEvent: CalendarEvent = {
        ...originalEvent,
        ...event,
        start: event.start ? new Date(event.start) : originalEvent.start,
        end: event.end ? new Date(event.end) : originalEvent.end,
        updatedAt: new Date(),
      };

      // Apply optimistic update immediately
      setEvents((prev) => prev.map((e) => (e.id === id ? optimisticEvent : e)));

      // Store rollback function
      const rollback = () => {
        setEvents((prev) => prev.map((e) => (e.id === id ? originalEvent : e)));
      };

      optimisticOperations.current.set(operationId, {
        id: operationId,
        type: "update",
        entityType: "event",
        originalData: originalEvent,
        rollback,
      });

      try {
        // Make API call
        const updatedEvent = await calendarApiService.updateEvent(id, event);

        // Replace optimistic event with real event
        setEvents((prev) => prev.map((e) => (e.id === id ? updatedEvent : e)));

        // Invalidate relevant cache entries
        eventsCache.current.clear();

        // Clean up operation tracking
        cleanupOperation(operationId);

        return updatedEvent;
      } catch (error) {
        // Rollback optimistic update on failure
        rollbackOperation(operationId);
        throw error as ApiError;
      }
    },
    [events, generateOptimisticId, rollbackOperation, cleanupOperation]
  );

  const deleteEvent = useCallback(
    async (id: string): Promise<void> => {
      // Store original event for rollback
      const originalEvent = events.find((e) => e.id === id);
      if (!originalEvent) {
        throw new Error("Event not found");
      }

      const operationId = generateOptimisticId();

      // Apply optimistic delete immediately
      setEvents((prev) => prev.filter((e) => e.id !== id));

      // Store rollback function
      const rollback = () => {
        setEvents((prev) => [...prev, originalEvent]);
      };

      optimisticOperations.current.set(operationId, {
        id: operationId,
        type: "delete",
        entityType: "event",
        originalData: originalEvent,
        rollback,
      });

      try {
        // Make API call
        await calendarApiService.deleteEvent(id);

        // Invalidate relevant cache entries
        eventsCache.current.clear();

        // Clean up operation tracking
        cleanupOperation(operationId);
      } catch (error) {
        // Rollback optimistic update on failure
        rollbackOperation(operationId);
        throw error as ApiError;
      }
    },
    [events, generateOptimisticId, rollbackOperation, cleanupOperation]
  );

  const createCategory = useCallback(
    async (category: CreateCategoryRequest): Promise<EventCategory> => {
      // Create optimistic category
      const optimisticCategory = createOptimisticCategory(category);
      const operationId = optimisticCategory.id;

      // Apply optimistic update immediately
      setCategories((prev) => [...prev, optimisticCategory]);

      // Store rollback function
      const rollback = () => {
        setCategories((prev) => prev.filter((c) => c.id !== operationId));
      };

      optimisticOperations.current.set(operationId, {
        id: operationId,
        type: "create",
        entityType: "category",
        rollback,
      });

      try {
        // Make API call
        const newCategory = await calendarApiService.createCategory(category);

        // Replace optimistic category with real category
        setCategories((prev) =>
          prev.map((c) => (c.id === operationId ? newCategory : c))
        );

        // Invalidate cache
        categoriesCache.current = null;

        // Clean up operation tracking
        cleanupOperation(operationId);

        return newCategory;
      } catch (error) {
        // Rollback optimistic update on failure
        rollbackOperation(operationId);
        throw error as ApiError;
      }
    },
    [createOptimisticCategory, rollbackOperation, cleanupOperation]
  );

  const updateCategory = useCallback(
    async (
      id: string,
      category: UpdateCategoryRequest
    ): Promise<EventCategory> => {
      // Store original category for rollback
      const originalCategory = categories.find((c) => c.id === id);
      if (!originalCategory) {
        throw new Error("Category not found");
      }

      const operationId = generateOptimisticId();

      // Create optimistic updated category
      const optimisticCategory: EventCategory = {
        ...originalCategory,
        ...category,
        updatedAt: new Date(),
      };

      // Apply optimistic update immediately
      setCategories((prev) =>
        prev.map((c) => (c.id === id ? optimisticCategory : c))
      );

      // Store rollback function
      const rollback = () => {
        setCategories((prev) =>
          prev.map((c) => (c.id === id ? originalCategory : c))
        );
      };

      optimisticOperations.current.set(operationId, {
        id: operationId,
        type: "update",
        entityType: "category",
        originalData: originalCategory,
        rollback,
      });

      try {
        // Make API call
        const updatedCategory = await calendarApiService.updateCategory(
          id,
          category
        );

        // Replace optimistic category with real category
        setCategories((prev) =>
          prev.map((c) => (c.id === id ? updatedCategory : c))
        );

        // Invalidate cache
        categoriesCache.current = null;

        // Clean up operation tracking
        cleanupOperation(operationId);

        return updatedCategory;
      } catch (error) {
        // Rollback optimistic update on failure
        rollbackOperation(operationId);
        throw error as ApiError;
      }
    },
    [categories, generateOptimisticId, rollbackOperation, cleanupOperation]
  );

  const deleteCategory = useCallback(
    async (id: string): Promise<void> => {
      // Store original category and affected events for rollback
      const originalCategory = categories.find((c) => c.id === id);
      if (!originalCategory) {
        throw new Error("Category not found");
      }

      const affectedEvents = events.filter((e) => e.categoryId === id);
      const operationId = generateOptimisticId();

      // Apply optimistic delete immediately
      setCategories((prev) => prev.filter((c) => c.id !== id));

      // Update events that used this category
      setEvents((prev) =>
        prev.map((e) =>
          e.categoryId === id ? { ...e, categoryId: null, category: null } : e
        )
      );

      // Store rollback function
      const rollback = () => {
        setCategories((prev) => [...prev, originalCategory]);
        setEvents((prev) =>
          prev.map((e) => {
            const affectedEvent = affectedEvents.find((ae) => ae.id === e.id);
            return affectedEvent ? affectedEvent : e;
          })
        );
      };

      optimisticOperations.current.set(operationId, {
        id: operationId,
        type: "delete",
        entityType: "category",
        originalData: { category: originalCategory, affectedEvents },
        rollback,
      });

      try {
        // Make API call
        await calendarApiService.deleteCategory(id);

        // Invalidate caches
        categoriesCache.current = null;
        eventsCache.current.clear();

        // Clean up operation tracking
        cleanupOperation(operationId);
      } catch (error) {
        // Rollback optimistic update on failure
        rollbackOperation(operationId);
        throw error as ApiError;
      }
    },
    [
      categories,
      events,
      generateOptimisticId,
      rollbackOperation,
      cleanupOperation,
    ]
  );

  // Calendar CRUD operations
  const createCalendar = useCallback(
    async (calendar: CreateCalendarRequest): Promise<Calendar> => {
      try {
        const newCalendar = await calendarApiService.createCalendar(calendar);
        setCalendars((prev) => [...prev, newCalendar]);
        calendarsCache.current = null; // Invalidate cache
        return newCalendar;
      } catch (error) {
        throw error as ApiError;
      }
    },
    []
  );

  const updateCalendar = useCallback(
    async (id: string, calendar: UpdateCalendarRequest): Promise<Calendar> => {
      try {
        const updatedCalendar = await calendarApiService.updateCalendar(id, calendar);
        setCalendars((prev) => prev.map((c) => (c.id === id ? updatedCalendar : c)));
        calendarsCache.current = null; // Invalidate cache
        return updatedCalendar;
      } catch (error) {
        throw error as ApiError;
      }
    },
    []
  );

  const deleteCalendar = useCallback(
    async (id: string): Promise<void> => {
      try {
        await calendarApiService.deleteCalendar(id);
        setCalendars((prev) => prev.filter((c) => c.id !== id));
        // Also remove events from this calendar
        setEvents((prev) => prev.filter((e) => e.calendarId !== id));
        calendarsCache.current = null; // Invalidate cache
        eventsCache.current.clear(); // Invalidate events cache
      } catch (error) {
        throw error as ApiError;
      }
    },
    []
  );

  // Utility functions
  const setDateRange = useCallback(
    (dateRange: DateRange): void => {
      setCurrentDateRange(dateRange);
      if (autoRefetch) {
        fetchEvents(dateRange);
      }
    },
    [autoRefetch, fetchEvents]
  );

  const clearCache = useCallback((): void => {
    eventsCache.current.clear();
    categoriesCache.current = null;
  }, []);

  // Initial data fetch
  useEffect(() => {
    if (autoRefetch) {
      fetchCalendars();
      fetchCategories();
    }
  }, [autoRefetch]); // Remove function dependencies to prevent infinite loops

  // Fetch events when date range changes
  useEffect(() => {
    if (autoRefetch && currentDateRange) {
      fetchEvents(currentDateRange);
    }
  }, [autoRefetch, currentDateRange]);

  // Computed values
  const loading = eventsLoading || calendarsLoading || categoriesLoading;
  const error = eventsError || calendarsError || categoriesError;

  return {
    // Data
    events,
    calendars,
    categories,

    // Loading states
    loading,
    eventsLoading,
    calendarsLoading,
    categoriesLoading,

    // Error states
    error,
    eventsError,
    calendarsError,
    categoriesError,

    // Actions
    refetch,
    refetchEvents,
    refetchCalendars,
    refetchCategories,

    // CRUD operations
    createEvent,
    updateEvent,
    deleteEvent,
    createCalendar,
    updateCalendar,
    deleteCalendar,
    createCategory,
    updateCategory,
    deleteCategory,

    // Utility
    setDateRange,
    clearCache,
  };
}
