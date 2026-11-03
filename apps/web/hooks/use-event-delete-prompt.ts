"use client";

import { useState } from "react";
import { createLogger } from "@workspace/logger";
import {
  canCurrentUserEditEvent,
  getErrorMessage,
  isCancelledCalendarEvent,
  type RecurrenceDeleteScope,
} from "@workspace/calendar-core";
import type { CalendarEvent } from "@workspace/ui/components/calendar";
import { toast } from "@workspace/ui/lib/toast";

import {
  getEventDeleteConfirmCopy,
  isRecurringEventDeleteCandidate,
  RECURRING_DELETE_FAILURE_MESSAGES,
  RECURRING_DELETE_SUCCESS_MESSAGES,
} from "@/lib/event-editor-view-model";
import type { UseCalendarDataReturn } from "./use-calendar-data";

const log = createLogger("event-delete-prompt");

/** Deletes from outside the editor ask exactly as the editor does: a scope for a series, a confirm otherwise. */
export function useEventDeletePrompt(
  calendarData: Pick<UseCalendarDataReturn, "deleteEvent" | "deleteRecurringEvent">,
) {
  const [target, setTarget] = useState<CalendarEvent | null>(null);
  const [open, setOpen] = useState(false);
  const asksScope =
    target !== null &&
    !isCancelledCalendarEvent(target) &&
    isRecurringEventDeleteCandidate(target);

  const requestDelete = (event: CalendarEvent) => {
    setTarget(event);
    setOpen(true);
  };

  const onOpenChange = (next: boolean) => {
    if (!next) setOpen(false);
  };

  const confirmDelete = () => {
    if (!target) return;
    const event = target;
    setOpen(false);
    calendarData.deleteEvent(event.id).then(
      () => {
        toast.success(`Event "${event.title}" deleted`);
      },
      (error: unknown) => {
        log.error("Failed to delete event:", error);
        toast.error("Failed to delete event");
      },
    );
  };

  const deleteWithScope = (scope: RecurrenceDeleteScope) => {
    if (!target) return;
    const event = target;
    setOpen(false);
    calendarData.deleteRecurringEvent({ event, scope }).then(
      () => {
        toast.success(RECURRING_DELETE_SUCCESS_MESSAGES[scope]);
      },
      (error: unknown) => {
        log.error("Failed to delete recurring event:", error);
        toast.error(
          getErrorMessage(error, RECURRING_DELETE_FAILURE_MESSAGES[scope]),
        );
      },
    );
  };

  const eventTitle = target?.title ?? "";

  return {
    requestDelete,
    confirmPrompt: {
      open: open && !asksScope,
      onOpenChange,
      ...getEventDeleteConfirmCopy(
        eventTitle,
        target !== null &&
          !canCurrentUserEditEvent(target) &&
          isCancelledCalendarEvent(target),
      ),
      onConfirm: confirmDelete,
    },
    scopePrompt: {
      open: open && asksScope,
      onOpenChange,
      action: "delete" as const,
      eventTitle,
      onSelect: deleteWithScope,
    },
  };
}
