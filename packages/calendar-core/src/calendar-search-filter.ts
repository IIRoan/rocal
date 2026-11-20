import { RecurrenceEngine } from "@workspace/calendar-ics/recurrence";

import { normalizeSearchText } from "./mail-search-relevance";
import {
  CALENDAR_SEARCH_OPERATOR_KEYS,
  NEGATED_TEXT_KEY,
  type SearchQueryOperator,
} from "./search-query";
import { resolveTimezone, wallClockFromCalendarDayKey } from "./timezone";
import type { Calendar, CalendarEvent } from "./types";

export const CALENDAR_SEARCH_OPERATOR_HINT =
  "Filter with guest:, location:, calendar:, after:2026-12-01, before:, is:recurring, is:allday, -word";

export type CalendarSearchContext = {
  timezone?: string | null;
  calendars?: Array<Pick<Calendar, "id" | "name">>;
};

type EventPredicate = (event: CalendarEvent) => boolean;

function containsText(value: string | null | undefined, needle: string): boolean {
  return Boolean(value) && normalizeSearchText(value ?? "").includes(needle);
}

const LATEST_DATE = new Date(8.64e15);

/** A series row stands for every occurrence, so it reaches a day if its rule runs past it. */
function seriesEndsAfter(event: CalendarEvent, instant: Date): boolean {
  const recurrence = event.recurrence;
  const rule = recurrence ? RecurrenceEngine.parseRecurrenceRule(recurrence) : null;
  if (!recurrence || !rule) return false;
  if (rule.until) return rule.until >= instant;
  if (!rule.count) return true;
  const start = new Date(event.start);
  const end = new Date(event.end);
  const earliestStart = new Date(instant.getTime() - (end.getTime() - start.getTime()));
  return (
    RecurrenceEngine.generateInstances(
      { id: event.id, start, end, recurrence },
      earliestStart,
      LATEST_DATE,
    ).length > 0
  );
}

function operatorPredicate(
  operator: SearchQueryOperator,
  context: CalendarSearchContext,
): EventPredicate | null {
  const needle = normalizeSearchText(operator.value);
  switch (operator.key) {
    case NEGATED_TEXT_KEY:
      return (event) =>
        containsText(event.title, needle) ||
        containsText(event.location, needle) ||
        containsText(event.description, needle);
    case "guest":
      return (event) =>
        (event.participants ?? []).some(
          (participant) =>
            containsText(participant.email, needle) ||
            containsText(participant.displayName, needle),
        );
    case "location":
      return (event) => containsText(event.location, needle);
    case "calendar": {
      const names = new Map(
        (context.calendars ?? []).map((calendar) => [calendar.id, calendar.name]),
      );
      return (event) =>
        containsText(names.get(event.calendarId) ?? event.calendar?.name, needle);
    }
    case "after":
    case "before": {
      const instant = wallClockFromCalendarDayKey(
        operator.value,
        0,
        0,
        resolveTimezone(context.timezone),
      );
      if (!instant || Number.isNaN(instant.getTime())) return null;
      return operator.key === "before"
        ? (event) => new Date(event.start) < instant
        : (event) => new Date(event.end) > instant || seriesEndsAfter(event, instant);
    }
    case "is":
      if (needle === "recurring") {
        return (event) =>
          Boolean(event.recurrence || event.parentEventId || event.isRecurringInstance);
      }
      if (needle === "allday" || needle === "all-day") {
        return (event) => event.allDay === true;
      }
      return null;
    default:
      return null;
  }
}

/** Applies typed operators on the device; one it cannot honour empties the result, so mail-only queries show mail. */
export function filterEventsBySearchOperators(
  events: CalendarEvent[],
  operators: SearchQueryOperator[],
  context: CalendarSearchContext = {},
): CalendarEvent[] {
  const predicates: EventPredicate[] = [];
  for (const operator of operators) {
    const supported =
      operator.key === NEGATED_TEXT_KEY || CALENDAR_SEARCH_OPERATOR_KEYS.has(operator.key);
    const predicate = supported ? operatorPredicate(operator, context) : null;
    if (!predicate) return [];
    predicates.push(
      operator.negated ? (event) => !predicate(event) : predicate,
    );
  }
  return events.filter((event) => predicates.every((predicate) => predicate(event)));
}
