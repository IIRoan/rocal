import useSWR, { mutate } from 'swr';
import { fetcher, apiRequest } from '@/lib/api/client';
import type { Calendar, CreateCalendarRequest, UpdateCalendarRequest } from '@/lib/types/calendar';

/**
 * Hook to fetch and manage calendars with SWR
 */
export function useCalendars() {
  const { data, error, isLoading } = useSWR<Calendar[]>('/calendars', fetcher);

  const createCalendar = async (calendar: CreateCalendarRequest): Promise<Calendar> => {
    // Optimistic update
    const optimisticCalendar: Calendar = {
      id: `temp_${Date.now()}`,
      name: calendar.name,
      color: calendar.color,
      isVisible: true,
      isDefault: calendar.isDefault || false,
      userId: 'current_user',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      const result = await mutate(
        '/calendars',
        apiRequest('/calendars', {
          method: 'POST',
          body: JSON.stringify(calendar),
        }),
        {
          optimisticData: [...(data || []), optimisticCalendar],
          rollbackOnError: true,
          populateCache: true,
          revalidate: false,
        }
      );
      // Find and return the created calendar from the result
      const createdCalendar = Array.isArray(result) 
        ? result.find(cal => cal.name === calendar.name && cal.color === calendar.color)
        : result;
      return createdCalendar || optimisticCalendar;
    } catch (error) {
      throw error;
    }
  };

  const updateCalendar = async (id: string, calendar: UpdateCalendarRequest): Promise<Calendar> => {
    const originalData = data || [];
    const optimisticData = originalData.map((cal) =>
      cal.id === id ? { ...cal, ...calendar, updatedAt: new Date() } : cal
    );

    try {
      const result = await mutate(
        '/calendars',
        apiRequest(`/calendars/${id}`, {
          method: 'PUT',
          body: JSON.stringify(calendar),
        }),
        {
          optimisticData,
          rollbackOnError: true,
          populateCache: true,
          revalidate: false,
        }
      );
      // Find and return the updated calendar from the result
      const updatedCalendar = Array.isArray(result) 
        ? result.find(cal => cal.id === id)
        : result;
      return updatedCalendar || optimisticData.find(cal => cal.id === id)!;
    } catch (error) {
      throw error;
    }
  };

  const deleteCalendar = async (id: string) => {
    const originalData = data || [];
    const optimisticData = originalData.filter((cal) => cal.id !== id);

    try {
      await mutate(
        '/calendars',
        apiRequest(`/calendars/${id}`, {
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
    calendars: data || [],
    isLoading,
    error,
    createCalendar,
    updateCalendar,
    deleteCalendar,
    mutate: () => mutate('/calendars'),
  };
}