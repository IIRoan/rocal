import {
  resolveRecurringEventTarget,
  shiftRecurringSeriesTimes,
  toRecurringEventUpdates,
  type CalendarEvent,
  type RecurrenceDeleteScope,
  type RecurrenceEditScope,
  type UpdateEventRequest,
} from "@workspace/calendar-core";
import type { CalendarApiService } from "./calendar-api-service";

type RecurringEventApi = Pick<
  CalendarApiService,
  "deleteEvent" | "deleteRecurringEvent" | "editRecurringEvent" | "getEvent" | "updateEvent"
>;

export interface EditRecurringEventInput {
  /** The event as it was before the edit, so the original occurrence date is used. */
  event: CalendarEvent;
  scope: RecurrenceEditScope;
  updates: UpdateEventRequest;
}

export interface DeleteRecurringEventInput {
  event: CalendarEvent;
  scope: RecurrenceDeleteScope;
}

export async function persistRecurringEventEdit(
  api: RecurringEventApi,
  { event, scope, updates }: EditRecurringEventInput,
): Promise<CalendarEvent> {
  const target = resolveRecurringEventTarget(event);
  if (!target) return api.updateEvent(event.id, updates);
  if (scope === "this_only" && target.detachedEventId) {
    return api.updateEvent(target.detachedEventId, updates);
  }

  let recurringUpdates = toRecurringEventUpdates(updates);
  if (scope === "all" && (recurringUpdates.start || recurringUpdates.end)) {
    const series =
      target.parentEventId === event.id
        ? event
        : await api.getEvent(target.parentEventId);
    const { start, end, ...rest } = recurringUpdates;
    recurringUpdates = {
      ...rest,
      ...shiftRecurringSeriesTimes({
        series,
        occurrence: event,
        next: { start, end },
        timezone: updates.timezone ?? series.timezone,
      }),
    };
  }

  return api.editRecurringEvent(target.parentEventId, {
    editScope: scope,
    occurrenceDate: scope === "all" ? undefined : target.occurrenceDate,
    updates: recurringUpdates,
  });
}

export async function persistRecurringEventDelete(
  api: RecurringEventApi,
  { event, scope }: DeleteRecurringEventInput,
): Promise<void> {
  const target = resolveRecurringEventTarget(event);
  if (!target) {
    await api.deleteEvent(event.id);
    return;
  }
  if (scope === "this_only" && target.detachedEventId) {
    await api.deleteEvent(target.detachedEventId);
    return;
  }
  await api.deleteRecurringEvent(
    target.parentEventId,
    scope,
    scope === "all" ? undefined : target.occurrenceDate,
  );
}
