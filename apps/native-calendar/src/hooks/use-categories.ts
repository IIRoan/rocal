import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  getErrorMessage,
  type CreateCategoryRequest,
  type EventCategory,
  type UpdateCategoryRequest,
} from "@workspace/calendar-core";
import { calendarApiService } from "@workspace/native-core/lib/api";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { useAuth } from "@workspace/native-core/providers/AuthProvider";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import { generateOptimisticId } from "../lib/optimistic-events";
import {
  buildOptimisticCategory,
  insertCategory,
  patchCategory,
  removeCategory,
  replaceCategory,
  sortCategories,
} from "../lib/categories-model";

type CategoriesSnapshot = { previous: EventCategory[] | undefined };

async function snapshotCategories(queryClient: QueryClient): Promise<CategoriesSnapshot> {
  await queryClient.cancelQueries({ queryKey: QUERY_KEYS.categories() });
  return { previous: queryClient.getQueryData<EventCategory[]>(QUERY_KEYS.categories()) };
}

function setCategories(
  queryClient: QueryClient,
  update: (current: EventCategory[] | undefined) => EventCategory[] | undefined,
) {
  queryClient.setQueryData<EventCategory[]>(QUERY_KEYS.categories(), update);
}

function rollbackCategories(queryClient: QueryClient, snapshot: CategoriesSnapshot | undefined) {
  if (snapshot) {
    queryClient.setQueryData(QUERY_KEYS.categories(), snapshot.previous);
  }
}

function invalidateCategories(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: QUERY_KEYS.categories() });
}

export function useCategories(enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.categories(),
    queryFn: () => calendarApiService.getCategories(),
    select: sortCategories,
    enabled,
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (request: CreateCategoryRequest) => calendarApiService.createCategory(request),
    onMutate: async (request) => {
      const snapshot = await snapshotCategories(queryClient);
      const tempId = generateOptimisticId();
      setCategories(queryClient, (current) =>
        insertCategory(current, buildOptimisticCategory(request, tempId, user?.id ?? "")),
      );
      return { ...snapshot, tempId };
    },
    onSuccess: (saved, _request, context) => {
      setCategories(queryClient, (current) => replaceCategory(current, context.tempId, saved));
      toast("Category created");
    },
    onError: (error, _request, context) => {
      rollbackCategories(queryClient, context);
      toast(getErrorMessage(error, "Failed to create category"), "error");
    },
    onSettled: () => invalidateCategories(queryClient),
  });
}

export function useUpdateCategory(categoryId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (request: UpdateCategoryRequest) =>
      calendarApiService.updateCategory(categoryId, request),
    onMutate: async (request) => {
      const snapshot = await snapshotCategories(queryClient);
      setCategories(queryClient, (current) => patchCategory(current, categoryId, request));
      return snapshot;
    },
    onSuccess: (saved) => {
      setCategories(queryClient, (current) => replaceCategory(current, categoryId, saved));
      toast("Category saved");
    },
    onError: (error, _request, context) => {
      rollbackCategories(queryClient, context);
      toast(getErrorMessage(error, "Failed to update category"), "error");
    },
    onSettled: () => invalidateCategories(queryClient),
  });
}

export function useDeleteCategory(categoryId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: () => calendarApiService.deleteCategory(categoryId),
    onMutate: async () => {
      const snapshot = await snapshotCategories(queryClient);
      setCategories(queryClient, (current) => removeCategory(current, categoryId));
      return snapshot;
    },
    onSuccess: () => {
      // The server clears this category from its events, so cached events still carry the stale id.
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.eventsRoot() });
      toast("Category deleted");
    },
    onError: (error, _request, context) => {
      rollbackCategories(queryClient, context);
      toast(getErrorMessage(error, "Failed to delete category"), "error");
    },
    onSettled: () => invalidateCategories(queryClient),
  });
}
