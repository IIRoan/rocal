"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SUBSCRIPTIONS_QUERY_KEY } from "@workspace/calendar-core";
import { toast } from "sonner";
import { calendarApiService } from "@/lib/calendar-api-service";
import { getErrorMessage } from "@/lib/calendar-ui-helpers";
import { EVENTS_QUERY_KEY } from "@/hooks/use-calendar-events-loader";
import type {
  ApiError,
  CalendarSubscription,
  CreateSubscriptionRequest,
  DeleteSubscriptionResponse,
  SyncSubscriptionResponse,
  UpdateSubscriptionRequest,
} from "@/lib/types/calendar";

type SubscriptionMutationContext = {
  refetchCalendars: () => Promise<unknown>;
};

export function useSubscriptions(open: boolean) {
  const queryClient = useQueryClient();
  return useQuery<CalendarSubscription[], ApiError>({
    queryKey: SUBSCRIPTIONS_QUERY_KEY,
    queryFn: () => calendarApiService.getSubscriptions(),
    enabled: open,
    initialData: () =>
      queryClient.getQueryData<CalendarSubscription[]>(SUBSCRIPTIONS_QUERY_KEY),
  });
}

/** Invalidates the subscription list, the calendar list, and every event range in the order the UI expects. */
async function refreshSubscriptionViews(
  queryClient: ReturnType<typeof useQueryClient>,
  refetchCalendars: () => Promise<unknown>,
) {
  await queryClient.invalidateQueries({ queryKey: SUBSCRIPTIONS_QUERY_KEY });
  await refetchCalendars();
  await queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY });
}

export function useCreateSubscriptionMutation(
  input: SubscriptionMutationContext & { onCreated: () => void },
) {
  const queryClient = useQueryClient();
  const { refetchCalendars, onCreated } = input;

  return useMutation({
    mutationFn: (data: CreateSubscriptionRequest) =>
      calendarApiService.createSubscription(data),
    onSuccess: async () => {
      await refreshSubscriptionViews(queryClient, refetchCalendars);
      toast.success("Read-only calendar added successfully.");
      onCreated();
    },
    onError: (error: ApiError) =>
      toast.error(getErrorMessage(error, "Failed to create subscription")),
  });
}

export function useDeleteSubscriptionMutation(
  input: SubscriptionMutationContext & { onDeleted: () => void },
) {
  const queryClient = useQueryClient();
  const { refetchCalendars, onDeleted } = input;

  return useMutation<DeleteSubscriptionResponse, ApiError, string>({
    mutationFn: (id: string) => calendarApiService.deleteSubscription(id),
    onSuccess: async () => {
      await refreshSubscriptionViews(queryClient, refetchCalendars);
      toast.success("Subscription removed.");
      onDeleted();
    },
    onError: (error: ApiError) =>
      toast.error(getErrorMessage(error, "Failed to remove subscription")),
  });
}

export function useSyncSubscriptionMutation(
  input: SubscriptionMutationContext & {
    subscriptions: CalendarSubscription[];
  },
) {
  const queryClient = useQueryClient();
  const { refetchCalendars, subscriptions } = input;

  return useMutation<SyncSubscriptionResponse, ApiError, string>({
    mutationFn: (id: string) => calendarApiService.syncSubscription(id),
    onSuccess: async (_: SyncSubscriptionResponse, id: string) => {
      await refreshSubscriptionViews(queryClient, refetchCalendars);
      const sub = subscriptions.find((subscription) => subscription.id === id);
      toast.success(`Synced "${sub?.name || "subscription"}"`);
    },
    onError: (error: ApiError) =>
      toast.error(getErrorMessage(error, "Failed to sync subscription")),
  });
}

export function useUpdateSubscriptionMutation(
  input: SubscriptionMutationContext & { onUpdated: () => void },
) {
  const queryClient = useQueryClient();
  const { refetchCalendars, onUpdated } = input;

  return useMutation<
    CalendarSubscription,
    ApiError,
    { id: string; request: UpdateSubscriptionRequest }
  >({
    mutationFn: ({ id, request }) =>
      calendarApiService.updateSubscription(id, request),
    onSuccess: async () => {
      await refreshSubscriptionViews(queryClient, refetchCalendars);
      toast.success("Calendar updated.");
      onUpdated();
    },
    onError: (error: ApiError) =>
      toast.error(getErrorMessage(error, "Failed to update calendar")),
  });
}
