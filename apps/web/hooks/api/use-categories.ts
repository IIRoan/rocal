import useSWR, { mutate } from 'swr';
import { fetcher, apiRequest } from '@/lib/api/client';
import type { EventCategory, CreateCategoryRequest, UpdateCategoryRequest } from '@/lib/types/calendar';

/**
 * Hook to fetch and manage event categories with SWR
 */
export function useCategories() {
  const { data, error, isLoading } = useSWR<EventCategory[]>('/categories', fetcher);

  const createCategory = async (category: CreateCategoryRequest) => {
    // Optimistic update
    const optimisticCategory: EventCategory = {
      id: `temp_${Date.now()}`,
      name: category.name,
      color: category.color,
      isActive: true,
      userId: 'current_user',
      usageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      await mutate(
        '/categories',
        apiRequest('/categories', {
          method: 'POST',
          body: JSON.stringify(category),
        }),
        {
          optimisticData: [...(data || []), optimisticCategory],
          rollbackOnError: true,
          populateCache: true,
          revalidate: false,
        }
      );
    } catch (error) {
      throw error;
    }
  };

  const updateCategory = async (id: string, category: UpdateCategoryRequest) => {
    const originalData = data || [];
    const optimisticData = originalData.map((cat) =>
      cat.id === id ? { ...cat, ...category, updatedAt: new Date() } : cat
    );

    try {
      await mutate(
        '/categories',
        apiRequest(`/categories/${id}`, {
          method: 'PUT',
          body: JSON.stringify(category),
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

  const deleteCategory = async (id: string) => {
    const originalData = data || [];
    const optimisticData = originalData.filter((cat) => cat.id !== id);

    try {
      await mutate(
        '/categories',
        apiRequest(`/categories/${id}`, {
          method: 'DELETE',
        }),
        {
          optimisticData,
          rollbackOnError: true,
          populateCache: true,
          revalidate: false,
        }
      );

      // Also invalidate events cache since they might reference this category
      mutate((key) => typeof key === 'string' && key.startsWith('/events'), undefined, { revalidate: true });
    } catch (error) {
      throw error;
    }
  };

  return {
    categories: data || [],
    isLoading,
    error,
    createCategory,
    updateCategory,
    deleteCategory,
    mutate: () => mutate('/categories'),
  };
}