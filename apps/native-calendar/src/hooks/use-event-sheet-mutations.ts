import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getErrorMessage,
  type RecentContactContext,
  type RecentContactUsageInput,
  type RecurrenceDeleteScope,
  type RecurrenceEditScope,
} from "@workspace/calendar-core";
import { calendarApiService } from "@workspace/native-core/lib/api";
import { toastOperationWarnings } from "@workspace/native-core/lib/operation-warnings";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { extractRecentContactEntries } from "@workspace/native-core/lib/record-recent-contacts";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import type { EventFormSubmission } from "../components/event/EventForm";
import {
  persistEventReminderNotifications,
  type ReminderTitleEncryptor,
} from "../lib/event-reminder-notifications";
import {
  buildOptimisticEvent,
  commitOptimisticEvent,
  generateOptimisticId,
  invalidateEventRanges,
  optimisticallyInsertEvent,
  optimisticallyRemoveEvent,
  rollbackFromSnapshot,
  type CacheSnapshot,
} from "../lib/optimistic-events";

export function useCreateEventMutation(input: {
  userId: string | undefined;
  userEmail: string | undefined;
  encryptReminderTitle: ReminderTitleEncryptor;
  recordUsage: (
    entries: RecentContactUsageInput[],
    context: RecentContactContext,
  ) => void;
  onDismiss: () => void;
  onServerErrors: (errors: string[]) => void;
}) {
  const {
    userId,
    userEmail,
    encryptReminderTitle,
    recordUsage,
    onDismiss,
    onServerErrors,
  } = input;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const snapshotRef = useRef<CacheSnapshot>([]);

  return useMutation({
    mutationFn: ({ request }: EventFormSubmission) =>
      calendarApiService.createEvent(request),
    onMutate: async ({ request }: EventFormSubmission) => {
      const tempId = generateOptimisticId();
      const optimisticEvent = buildOptimisticEvent(
        request,
        userId ?? "",
        tempId,
      );
      snapshotRef.current = await optimisticallyInsertEvent(
        queryClient,
        optimisticEvent,
      );
      onServerErrors([]);
      onDismiss();
      return { tempId };
    },
    onSuccess: (savedEvent, { request, reminders }, context) => {
      commitOptimisticEvent(queryClient, context.tempId, savedEvent);
      // repo-rules-allow async-promise-handling: invalidateEventRanges returns invalidateQueries, which never rejects.
      void invalidateEventRanges(queryClient, savedEvent);
      // Reminders are a separate round trip that never throws, so they stay off the timeline's critical path.
      // repo-rules-allow async-promise-handling: persistEventReminderNotifications catches internally, so this chain never rejects.
      void persistEventReminderNotifications(
        savedEvent.id,
        request.title,
        reminders,
        encryptReminderTitle,
      ).then(() =>
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.eventNotifications(savedEvent.id),
        }),
      );
      const entries = extractRecentContactEntries(
        request.participants,
        userEmail,
      );
      if (entries.length > 0) {
        recordUsage(entries, "calendar");
      }
      toast("Event created");
      toastOperationWarnings(toast, savedEvent);
    },
    onError: (err: unknown) => {
      rollbackFromSnapshot(queryClient, snapshotRef.current);
      toast(getErrorMessage(err, "Failed to create event"), "error");
    },
  });
}

export function useUpdateEventMutation(input: {
  eventId: string | undefined;
  editScope: RecurrenceEditScope | undefined;
  editOccurrenceDate: string | undefined;
  userEmail: string | undefined;
  encryptReminderTitle: ReminderTitleEncryptor;
  recordUsage: (
    entries: RecentContactUsageInput[],
    context: RecentContactContext,
  ) => void;
  onDismiss: () => void;
  onServerErrors: (errors: string[]) => void;
}) {
  const {
    eventId,
    editScope,
    editOccurrenceDate,
    userEmail,
    encryptReminderTitle,
    recordUsage,
    onDismiss,
    onServerErrors,
  } = input;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ request, reminders }: EventFormSubmission) => {
      if (!eventId) {
        throw new Error("An existing event is required to update it.");
      }
      const saved = editScope
        ? await calendarApiService.editRecurringEvent(eventId, {
            editScope,
            occurrenceDate: editOccurrenceDate,
            updates: request,
          })
        : await calendarApiService.updateEvent(eventId, request);
      await persistEventReminderNotifications(
        saved.id,
        request.title,
        reminders,
        encryptReminderTitle,
      );
      return saved;
    },
    onSuccess: (savedEvent, { request }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.eventsRoot() });
      if (eventId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.eventDetail(eventId),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.eventNotifications(eventId),
        });
      }
      const entries = extractRecentContactEntries(
        request.participants,
        userEmail,
      );
      if (entries.length > 0) {
        recordUsage(entries, "calendar");
      }
      onServerErrors([]);
      toast("Event updated");
      toastOperationWarnings(toast, savedEvent);
      onDismiss();
    },
    onError: (err: unknown) => {
      onServerErrors([getErrorMessage(err, "Failed to update event")]);
    },
  });
}

export function useDeleteEventMutation(input: {
  eventId: string | undefined;
  onDismiss: () => void;
}) {
  const { eventId, onDismiss } = input;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const snapshotRef = useRef<CacheSnapshot>([]);

  return useMutation({
    mutationFn: async ({
      scope,
      occurrenceDate,
    }: {
      scope?: RecurrenceDeleteScope;
      occurrenceDate?: string;
    }) => {
      if (!eventId) {
        throw new Error("An existing event is required to delete it.");
      }
      if (scope) {
        return calendarApiService.deleteRecurringEvent(
          eventId,
          scope,
          occurrenceDate,
        );
      }
      return calendarApiService.deleteEvent(eventId);
    },
    onMutate: async () => {
      if (eventId) {
        snapshotRef.current = await optimisticallyRemoveEvent(
          queryClient,
          eventId,
        );
        onDismiss();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.eventsRoot() });
      if (eventId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.eventDetail(eventId),
        });
      }
      toast("Event deleted");
    },
    onError: (err: unknown) => {
      rollbackFromSnapshot(queryClient, snapshotRef.current);
      toast(getErrorMessage(err, "Failed to delete event"), "error");
    },
  });
}

export function useRespondToInvitationMutation(input: {
  eventId: string | undefined;
  onDismiss: () => void;
}) {
  const { eventId, onDismiss } = input;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (status: "accepted" | "declined" | "tentative") => {
      if (!eventId) {
        throw new Error("An existing event is required to respond to it.");
      }
      return calendarApiService.respondToInvitation(eventId, status);
    },
    onSuccess: (result, status) => {
      if (eventId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.eventDetail(eventId),
        });
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.eventsRoot() });
      if ("deleted" in result && result.deleted) {
        toast("Invitation declined");
        onDismiss();
        return;
      }
      toast(
        status === "accepted"
          ? "Invitation accepted"
          : status === "tentative"
            ? "Marked as maybe"
            : "Invitation declined",
      );
    },
    onError: (err: unknown) => {
      toast(getErrorMessage(err, "Failed to respond to invitation"), "error");
    },
  });
}
