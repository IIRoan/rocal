import useSWR, { mutate } from 'swr';
import { fetcher, apiRequest } from '@/lib/api/client';
import type { CalendarEvent, CreateEventRequest, UpdateEventRequest } from '@/lib/types/calendar';

/**
 * Hook to fetch events for a date range with SWR
 */
export function useEvents(startDate?: Date, endDate?: Date) {
  // Create cache key based on date range
  const key = startDate && endDate 
    ? `/events?start=${startDate.toISOString()}&end=${endDate.toISOString()}`
    : null;

  const { data, error, isLoading } = useSWR<CalendarEvent[]>(key, fetcher);

  const createEvent = async (event: CreateEventRequest) => {
    // Optimistic update
    const optimisticEvent: CalendarEvent = {
      id: `temp_${Date.now()}`,
      title: event.title,
      description: event.description || null,
      start: new Date(event.start),
      end: new Date(event.end),
      allDay: event.allDay || false,
      location: event.location || null,
      color: event.color || null,
      calendarId: event.calendarId,
      calendar: null, // Will be populated by server response
      categoryId: event.categoryId || null,
      category: null, // Will be populated by server response
      userId: 'current_user',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      await mutate(
        key,
        apiRequest('/events', {
          method: 'POST',
          body: JSON.stringify(event),
        }),
        {
          optimisticData: [...(data || []), optimisticEvent],
          rollbackOnError: true,
          populateCache: true,
          revalidate: false,
        }
      );
    } catch (error) {
      throw error;
    }
  };

  const updateEvent = async (id: string, event: UpdateEventRequest) => {
    const originalData = data || [];
    const optimisticData = originalData.map((evt) =>
      evt.id === id 
        ? { 
            ...evt, 
            ...event,
            start: event.start ? new Date(event.start) : evt.start,
            end: event.end ? new Date(event.end) : evt.end,
            updatedAt: new Date() 
          } 
        : evt
    );

    try {
      await mutate(
        key,
        apiRequest(`/events/${id}`, {
          method: 'PUT',
          body: JSON.stringify(event),
        }),
        {
          optimisticData,
          rollbackOnError: true,
          populateCache: true,
          revalidate: false,
        }
      );
    } catch (error) {
      throw error;
    }
  };

  const deleteEvent = async (id: string) => {
    const originalData = data || [];
    const optimisticData = originalData.filter((evt) => evt.id !== id);

    try {
      await mutate(
        key,
        apiRequest(`/events/${id}`, {
          method: 'DELETE',
        }),
        {
          optimisticData,
          rollbackOnError: true,
          populateCache: true,
          revalidate: false,
        }
      );
    } catch (error) {
      throw error;
    }
  };

  return {
    events: data || [],
    isLoading,
    error,
    createEvent,
    updateEvent,
    deleteEvent,
    mutate: () => mutate(key),
  };
}