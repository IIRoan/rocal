"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  CATEGORIES_QUERY_KEY,
  buildOptimisticCategory,
  getErrorMessage,
  insertCategory,
  patchCategory,
  removeCategory,
  replaceCategory,
  sortCategories,
  type CreateCategoryRequest,
  type EventCategory,
  type UpdateCategoryRequest,
} from "@workspace/calendar-core";
import { toast } from "sonner";
import { useSession } from "@/lib/auth-client";
import { calendarApiService } from "@/lib/calendar-api-service";
import { EVENTS_QUERY_KEY } from "./use-calendar-events-loader";

type CategoriesSnapshot = { previous: EventCategory[] | undefined };

async function snapshotCategories(
  queryClient: QueryClient,
): Promise<CategoriesSnapshot> {
  await queryClient.cancelQueries({ queryKey: CATEGORIES_QUERY_KEY });
  return {
    previous: queryClient.getQueryData<EventCategory[]>(CATEGORIES_QUERY_KEY),
  };
}

function setCategories(
  queryClient: QueryClient,
  update: (current: EventCategory[] | undefined) => EventCategory[] | undefined,
) {
  queryClient.setQueryData<EventCategory[]>(CATEGORIES_QUERY_KEY, update);
}

function rollbackCategories(
  queryClient: QueryClient,
  context: CategoriesSnapshot | undefined,
) {
  if (context) {
    queryClient.setQueryData(CATEGORIES_QUERY_KEY, context.previous);
  }
}

export function useCategories(enabled = true) {
  return useQuery({
    queryKey: CATEGORIES_QUERY_KEY,
    queryFn: () => calendarApiService.getCategories(),
    enabled,
    select: sortCategories,
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  return useMutation({
    mutationFn: (request: CreateCategoryRequest) =>
      calendarApiService.createCategory(request),
    onMutate: async (request) => {
      const snapshot = await snapshotCategories(queryClient);
      const tempId = `temp-${crypto.randomUUID()}`;
      setCategories(queryClient, (current) =>
        insertCategory(
          current,
          buildOptimisticCategory(request, tempId, session?.user?.id ?? ""),
        ),
      );
      return { ...snapshot, tempId };
    },
    onSuccess: (saved, _request, context) => {
      setCategories(queryClient, (current) =>
        replaceCategory(current, context.tempId, saved),
      );
      toast.success("Category created");
    },
    onError: (error, _request, context) => {
      rollbackCategories(queryClient, context);
      toast.error(getErrorMessage(error, "Failed to create category"));
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY }),
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      request,
    }: {
      id: string;
      request: UpdateCategoryRequest;
    }) => calendarApiService.updateCategory(id, request),
    onMutate: async ({ id, request }) => {
      const snapshot = await snapshotCategories(queryClient);
      setCategories(queryClient, (current) =>
        patchCategory(current, id, request),
      );
      return snapshot;
    },
    onSuccess: (saved, { id }) => {
      setCategories(queryClient, (current) =>
        replaceCategory(current, id, saved),
      );
      toast.success("Category saved");
    },
    onError: (error, _input, context) => {
      rollbackCategories(queryClient, context);
      toast.error(getErrorMessage(error, "Failed to update category"));
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY }),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => calendarApiService.deleteCategory(id),
    onMutate: async (id) => {
      const snapshot = await snapshotCategories(queryClient);
      setCategories(queryClient, (current) => removeCategory(current, id));
      return snapshot;
    },
    onSuccess: () => {
      // The server clears this category from its events, so cached events still carry the stale id.
      void queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY });
      toast.success("Category deleted");
    },
    onError: (error, _id, context) => {
      rollbackCategories(queryClient, context);
      toast.error(getErrorMessage(error, "Failed to delete category"));
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY }),
  });
}
