import { useCallback, useState } from "react";
import type {
  CalendarEvent,
  RecurrenceEditScope,
} from "@workspace/calendar-core";
import { useAuth } from "@workspace/native-core/providers/AuthProvider";
import { useRecentContacts } from "@workspace/native-core/hooks/use-recent-contacts";
import { calendarApiService } from "@workspace/native-core/lib/api";
import { checkEventRecurrence } from "../lib/event-recurrence-validation";
import type { EventFormSubmission } from "../components/event/EventForm";
import { useReminderTitleEncryptor } from "./use-reminder-title-encryptor";
import {
  useCreateEventMutation,
  useUpdateEventMutation,
} from "./use-event-sheet-mutations";

export function useEventSheetSubmit({
  isCreate,
  event,
  editScope,
  onDismiss,
  onServerErrors,
}: {
  isCreate: boolean;
  event?: CalendarEvent;
  editScope?: RecurrenceEditScope;
  onDismiss: () => void;
  onServerErrors: (errors: string[]) => void;
}) {
  const { user } = useAuth();
  const { recordUsage } = useRecentContacts();
  const encryptReminderTitle = useReminderTitleEncryptor();
  const [validatingRecurrence, setValidatingRecurrence] = useState(false);

  const createMutation = useCreateEventMutation({
    userId: user?.id,
    userEmail: user?.email,
    encryptReminderTitle,
    recordUsage,
    onDismiss,
    onServerErrors,
  });

  const updateMutation = useUpdateEventMutation({
    event,
    editScope,
    userEmail: user?.email,
    encryptReminderTitle,
    recordUsage,
    onDismiss,
    onServerErrors,
  });

  const submitEvent = useCallback(
    async (submission: EventFormSubmission) => {
      onServerErrors([]);
      setValidatingRecurrence(true);
      const recurrenceError = await checkEventRecurrence(
        submission.request.recurrence,
        (rule) => calendarApiService.validateRecurrence(rule),
      );
      setValidatingRecurrence(false);
      if (recurrenceError) {
        onServerErrors([recurrenceError]);
        return;
      }
      if (isCreate) createMutation.mutate(submission);
      else updateMutation.mutate(submission);
    },
    [isCreate, createMutation, updateMutation, onServerErrors],
  );

  const handleSubmit = useCallback(
    // repo-rules-allow async-promise-handling: submitEvent awaits only checkEventRecurrence, which catches internally; mutate() reports via onError.
    (submission: EventFormSubmission) => void submitEvent(submission),
    [submitEvent],
  );

  return {
    handleSubmit,
    isSubmitting:
      validatingRecurrence ||
      createMutation.isPending ||
      updateMutation.isPending,
  };
}
