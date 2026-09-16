import type {
  RecurringRuleInput,
  RecurringUpdates,
} from "../contracts/recurring.contract";
import { hasEncryptedPayloadValue } from "@workspace/calendar-core";
import { ValidationError } from "./errors";
import { RecurrenceEngine, type RecurrenceRule } from "./recurrence";
import { MS_PER_DAY as DAY_IN_MS } from "./time-constants";

type RecurringEventSnapshot = {
  title: string;
  description: string | null;
  encryptedContent: string | null;
  blindIndexTokens: string | null;
  encryptionState: string;
  encryptionKeyVersion: number;
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

/** Stored ciphertext is carried over so modified occurrences of encrypted series stay encrypted. */
function resolveRecurringContentData(
  existingEvent: RecurringEventSnapshot,
  updates: RecurringUpdates,
) {
  if (hasEncryptedPayloadValue(updates.encryptedContent)) {
    return {
      title: "",
      description: null,
      location: null,
      encryptedContent: updates.encryptedContent,
      blindIndexTokens: JSON.stringify(updates.blindIndexTokens ?? []),
      encryptionState: "encrypted",
      encryptionKeyVersion: updates.encryptionKeyVersion ?? 1,
    };
  }

  const editsContent =
    updates.title !== undefined ||
    updates.description !== undefined ||
    updates.location !== undefined;

  if (editsContent && existingEvent.encryptedContent) {
    throw new ValidationError(
      "Encrypted content payload is required when updating protected event fields.",
      "encryptedContent",
    );
  }

  return {
    title: updates.title ?? existingEvent.title,
    description: updates.description ?? existingEvent.description,
    location: updates.location ?? existingEvent.location,
    encryptedContent: existingEvent.encryptedContent,
    blindIndexTokens: existingEvent.blindIndexTokens,
    encryptionState: existingEvent.encryptionState,
    encryptionKeyVersion: existingEvent.encryptionKeyVersion,
  };
}

export function buildRecurringEventCreateData(
  input: BuildRecurringEventCreateDataInput,
) {
  const {
    existingEvent,
    updates,
    userId,
    parentEventId,
    recurrence,
    occurrenceDate,
  } = input;
  const durationMs = Math.max(
    0,
    existingEvent.end.getTime() - existingEvent.start.getTime(),
  );
  const start = updates.start
    ? new Date(updates.start)
    : (occurrenceDate ?? existingEvent.start);
  const end = updates.end
    ? new Date(updates.end)
    : new Date(start.getTime() + durationMs);

  return {
    ...resolveRecurringContentData(existingEvent, updates),
    allDay: updates.allDay ?? existingEvent.allDay,
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

export function buildRecurringEventUpdateData(
  existingEvent: RecurringEventSnapshot,
  updates: RecurringUpdates,
) {
  const editsContent =
    hasEncryptedPayloadValue(updates.encryptedContent) ||
    updates.title !== undefined ||
    updates.description !== undefined ||
    updates.location !== undefined;

  return {
    allDay: updates.allDay,
    color: updates.color,
    reminder: updates.reminder,
    recurrence: updates.recurrence,
    calendarId: updates.calendarId,
    categoryId: updates.categoryId,
    ...(editsContent ? resolveRecurringContentData(existingEvent, updates) : {}),
    start: updates.start ? new Date(updates.start) : undefined,
    end: updates.end ? new Date(updates.end) : undefined,
    updatedAt: new Date(),
  };
}
