import type {
  RecurringRuleInput,
  RecurringUpdates,
} from "../contracts/recurring.contract";
import { ValidationError } from "./errors";
import { RecurrenceEngine, type RecurrenceRule } from "./recurrence";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

type RecurringEventSnapshot = {
  title: string;
  description: string | null;
  allDay: boolean;
  location: string | null;
  color: string | null;
  reminder: number | null;
  recurrence: string | null;
  calendarId: string;
  categoryId: string | null;
  start: Date;
  end: Date;
};

type BuildRecurringEventCreateDataInput = {
  existingEvent: RecurringEventSnapshot;
  updates: RecurringUpdates;
  userId: string;
  parentEventId: string;
  recurrence: string | null;
  occurrenceDate?: Date;
};

export function parseRecurringRuleInput(
  input: RecurringRuleInput,
): RecurrenceRule | null {
  if (typeof input === "string") {
    return RecurrenceEngine.parseRecurrenceRule(input);
  }

  return { ...(input as RecurrenceRule) };
}

export function requireOccurrenceDate(
  occurrenceDate: string | undefined,
  scope: "this_only" | "this_and_future",
  operation: "edit" | "delete",
): Date {
  if (!occurrenceDate) {
    throw new ValidationError(
      `Occurrence date is required for '${scope}' ${operation}`,
      "occurrenceDate",
    );
  }

  return new Date(occurrenceDate);
}

export function splitRecurringSeriesRule(
  recurrence: string | null | undefined,
  splitDate: Date,
): string | null {
  if (!recurrence) {
    return null;
  }

  const originalRule = RecurrenceEngine.parseRecurrenceRule(recurrence);
  if (!originalRule) {
    return null;
  }

  originalRule.until = new Date(splitDate.getTime() - DAY_IN_MS);
  return RecurrenceEngine.createRecurrenceRule(originalRule);
}

export function buildRecurringEventCreateData(
  input: BuildRecurringEventCreateDataInput,
) {
  const { existingEvent, updates, userId, parentEventId, recurrence, occurrenceDate } =
    input;
  const durationMs = Math.max(
    0,
    existingEvent.end.getTime() - existingEvent.start.getTime(),
  );
  const start = updates.start
    ? new Date(updates.start)
    : occurrenceDate ?? existingEvent.start;
  const end = updates.end
    ? new Date(updates.end)
    : new Date(start.getTime() + durationMs);

  return {
    title: updates.title ?? existingEvent.title,
    description: updates.description ?? existingEvent.description,
    allDay: updates.allDay ?? existingEvent.allDay,
    location: updates.location ?? existingEvent.location,
    color: updates.color ?? existingEvent.color,
    reminder: updates.reminder ?? existingEvent.reminder,
    recurrence,
    calendarId: updates.calendarId ?? existingEvent.calendarId,
    categoryId: updates.categoryId ?? existingEvent.categoryId,
    userId,
    parentEventId,
    start,
    end,
  };
}

export function buildRecurringEventUpdateData(updates: RecurringUpdates) {
  return {
    ...updates,
    start: updates.start ? new Date(updates.start) : undefined,
    end: updates.end ? new Date(updates.end) : undefined,
    updatedAt: new Date(),
  };
}