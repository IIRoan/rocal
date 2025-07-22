import { useState, useCallback } from 'react';
import { useCalendars } from './api/use-calendars';
import { useEvents } from './api/use-events';
import { useCategories } from './api/use-categories';

/**
 * Combined hook that provides all calendar data and operations using SWR
 * This replaces the original use-calendar-data.ts hook
 */
interface DateRange {
  start: Date;
  end: Date;
}

interface UseCalendarDataOptions {
  initialDateRange?: DateRange;
}

export function useCalendarData(options: UseCalendarDataOptions = {}) {
  const { initialDateRange } = options;
  
  // Current date range state
  const [dateRange, setDateRange] = useState<DateRange | null>(
    initialDateRange || null
  );

  // SWR hooks for data fetching
  const {
    calendars,
    isLoading: calendarsLoading,
    error: calendarsError,
    createCalendar,
    updateCalendar,
    deleteCalendar,
    mutate: mutateCalendars,
  } = useCalendars();

  const {
    events,
    isLoading: eventsLoading,
    error: eventsError,
    createEvent,
    updateEvent,
    deleteEvent,
    mutate: mutateEvents,
  } = useEvents(dateRange?.start, dateRange?.end);

  const {
    categories,
    isLoading: categoriesLoading,
    error: categoriesError,
    createCategory,
    updateCategory,
    deleteCategory,
    mutate: mutateCategories,
  } = useCategories();

  // Combined loading and error states
  const loading = calendarsLoading || eventsLoading || categoriesLoading;
  const error = calendarsError || eventsError || categoriesError;

  // Set date range and trigger events refetch
  const handleSetDateRange = useCallback((newDateRange: DateRange) => {
    setDateRange(newDateRange);
    // Events will automatically refetch due to SWR key change
  }, []);

  // Refetch all data
  const refetch = useCallback(async () => {
    await Promise.all([
      mutateCalendars(),
      mutateEvents(),
      mutateCategories(),
    ]);
  }, [mutateCalendars, mutateEvents, mutateCategories]);

  // Enhanced create functions that invalidate related caches
  const createEventEnhanced = useCallback(async (event: Parameters<typeof createEvent>[0]) => {
    const result = await createEvent(event);
    // Optionally refresh calendars if they track event counts
    mutateCalendars();
    return result;
  }, [createEvent, mutateCalendars]);

  const createCalendarEnhanced = useCallback(async (calendar: Parameters<typeof createCalendar>[0]) => {
    const result = await createCalendar(calendar);
    // Refresh events to include the new calendar relationship
    mutateEvents();
    return result;
  }, [createCalendar, mutateEvents]);

  const createCategoryEnhanced = useCallback(async (category: Parameters<typeof createCategory>[0]) => {
    const result = await createCategory(category);
    // Categories might affect event display
    mutateEvents();
    return result;
  }, [createCategory, mutateEvents]);

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

    // CRUD operations with enhanced cache invalidation
    createEvent: createEventEnhanced,
    updateEvent,
    deleteEvent,
    createCalendar: createCalendarEnhanced,
    updateCalendar,
    deleteCalendar,
    createCategory: createCategoryEnhanced,
    updateCategory,
    deleteCategory,

    // Utility functions
    setDateRange: handleSetDateRange,
    refetch,
    
    // Individual mutate functions for fine-grained control
    mutateEvents,
    mutateCalendars,
    mutateCategories,
    
    // Current date range
    currentDateRange: dateRange,
  };
}