import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useFeedSync } from "@workspace/calendar-client/use-feed-sync";
import {
  feedSyncUrl,
  getErrorMessage,
  type CalendarSubscription,
  type CreateCalendarRequest,
  type CreateSubscriptionRequest,
  type UpdateCalendarRequest,
  type UpdateSubscriptionRequest,
} from "@workspace/calendar-core";
import { calendarApiService } from "@workspace/native-core/lib/api";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { useAuth } from "@workspace/native-core/providers/AuthProvider";
import { useE2ee } from "@workspace/native-core/providers/E2eeProvider";
import { useToast } from "@workspace/native-core/providers/ToastProvider";

export type DeleteCalendarAction = "delete_events" | "move_events";

function invalidateCalendarData(
  queryClient: QueryClient,
  {
    subscriptions = false,
    settings = false,
    events = true,
  }: { subscriptions?: boolean; settings?: boolean; events?: boolean } = {},
) {
  void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.calendars() });
  if (subscriptions) {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.subscriptions() });
  }
  if (settings) {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings() });
  }
  if (events) {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.eventsRoot() });
  }
}

export function useCalendars() {
  return useQuery({
    queryKey: QUERY_KEYS.calendars(),
    queryFn: () => calendarApiService.getCalendars(),
  });
}

export function useCalendarSubscriptions() {
  return useQuery({
    queryKey: QUERY_KEYS.subscriptions(),
    queryFn: () => calendarApiService.getSubscriptions(),
  });
}

export function useCreateCalendar() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (request: CreateCalendarRequest) => calendarApiService.createCalendar(request),
    onSuccess: () => {
      invalidateCalendarData(queryClient, { settings: true, events: false });
      toast("Calendar created");
    },
    onError: (error) => toast(getErrorMessage(error, "Failed to create calendar"), "error"),
  });
}

export function useUpdateCalendar(calendarId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (request: UpdateCalendarRequest) =>
      calendarApiService.updateCalendar(calendarId, request),
    onSuccess: () => {
      // Event colors and visibility are resolved from the calendars query on the client.
      invalidateCalendarData(queryClient, { settings: true, events: false });
      toast("Calendar saved");
    },
    onError: (error) => toast(getErrorMessage(error, "Failed to update calendar"), "error"),
  });
}

export function useDeleteCalendar(calendarId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ action, moveTargetId }: { action: DeleteCalendarAction; moveTargetId?: string }) =>
      calendarApiService.deleteCalendarAdvanced(calendarId, action, moveTargetId),
    onSuccess: () => {
      invalidateCalendarData(queryClient, { settings: true });
      toast("Calendar deleted");
    },
    onError: (error) => toast(getErrorMessage(error, "Failed to delete calendar"), "error"),
  });
}

export function useSyncSubscription() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (subscription: CalendarSubscription) =>
      calendarApiService.syncSubscription(subscription.id, feedSyncUrl(subscription)),
    onSuccess: (result) => {
      invalidateCalendarData(queryClient, { subscriptions: true });
      if (result.status === "error") {
        toast(
          result.message ?? result.errors?.join("\n") ?? "The calendar feed returned an error.",
          "error",
        );
      } else {
        toast("Calendar synced");
      }
    },
    onError: (error) => toast(getErrorMessage(error, "Failed to sync calendar"), "error"),
  });
}

/** Sealed feeds sync only while a Calendar client is open, because the server keeps no URL to fetch. */
export function useFeedSyncWhileOpen() {
  const { isAuthenticated } = useAuth();
  const { isReady } = useE2ee();
  useFeedSync({ api: calendarApiService, enabled: isAuthenticated && isReady });
}

export function useCreateSubscription() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (request: CreateSubscriptionRequest) =>
      calendarApiService.createSubscription(request),
    onSuccess: (_subscription, request) => {
      invalidateCalendarData(queryClient, { subscriptions: true });
      toast(`Added ${request.name}`);
    },
    onError: (error) => toast(getErrorMessage(error, "Failed to add read-only calendar"), "error"),
  });
}

export function useUpdateSubscription(subscriptionId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (request: UpdateSubscriptionRequest) =>
      calendarApiService.updateSubscription(subscriptionId, request),
    onSuccess: () => {
      invalidateCalendarData(queryClient, { subscriptions: true });
      toast("Calendar updated");
    },
    onError: (error) =>
      toast(getErrorMessage(error, "Failed to update read-only calendar"), "error"),
  });
}

export function useDeleteSubscription(subscriptionId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: () => calendarApiService.deleteSubscription(subscriptionId),
    onSuccess: () => {
      invalidateCalendarData(queryClient, { subscriptions: true });
      toast("Calendar removed");
    },
    onError: (error) =>
      toast(getErrorMessage(error, "Failed to remove read-only calendar"), "error"),
  });
}

export function useImportIcs() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (request: { calendarId: string; icsContent: string; fileName: string }) =>
      calendarApiService.importICS(request),
    onSuccess: (result) => {
      invalidateCalendarData(queryClient);
      toast(
        `Imported ${result.eventsCreated} of ${result.eventsTotal} events${
          result.calendarName ? ` into ${result.calendarName}` : ""
        }`,
      );
    },
    onError: (error) => toast(getErrorMessage(error, "Failed to import .ics file"), "error"),
  });
}
