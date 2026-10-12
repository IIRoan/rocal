import { useReducer } from "react";
import {
  normalizeReminderMinutes,
  type CreateEventRequest,
  type EventParticipantInput,
  type RecurrenceRule,
} from "@workspace/calendar-core";
import { parseStoredRecurrence } from "./recurrence-picker-utils";
import { roundToNextHour, toTimezonePickerISOString } from "./event-form-utils";

const DEFAULT_REMINDER_MINUTES = 15;

export type OpenSheet =
  | "calendar"
  | "category"
  | "repeat"
  | "reminder"
  | "participants"
  | null;
export type DateTimeTarget =
  | "start-date"
  | "start-time"
  | "end-date"
  | "end-time";

export interface EventFormFields {
  title: string;
  allDay: boolean;
  start: string;
  end: string;
  pickedCalendarId: string;
  location: string;
  description: string;
  categoryId: string;
  recurrenceRule: RecurrenceRule | null;
  reminders: number[];
  participants: EventParticipantInput[];
}

export interface EventFormUi {
  openSheet: OpenSheet;
  /** Outlives the open flag so the sheet keeps its content while it animates closed. */
  dateTimeTarget: DateTimeTarget;
  dateTimePickerOpen: boolean;
  /** null adds a reminder; an index replaces that reminder. */
  reminderEditIndex: number | null;
  customRepeatOpen: boolean;
  fieldErrors: Record<string, string>;
  generalErrors: string[];
}

type Update<T> = Partial<T> | ((current: T) => Partial<T>);

function merge<T>(current: T, update: Update<T>): T {
  return {
    ...current,
    ...(typeof update === "function" ? update(current) : update),
  };
}

function initialFields({
  initialValues,
  initialReminders,
  timezone,
}: {
  initialValues?: Partial<CreateEventRequest>;
  initialReminders?: number[];
  timezone: string;
}): EventFormFields {
  const defaultStart = roundToNextHour(new Date());
  const defaultEnd = new Date(defaultStart.getTime() + 60 * 60 * 1000);
  return {
    title: initialValues?.title ?? "",
    allDay: initialValues?.allDay ?? false,
    start:
      initialValues?.start ?? toTimezonePickerISOString(defaultStart, timezone),
    end: initialValues?.end ?? toTimezonePickerISOString(defaultEnd, timezone),
    pickedCalendarId: initialValues?.calendarId ?? "",
    location: initialValues?.location ?? "",
    description: initialValues?.description ?? "",
    categoryId: initialValues?.categoryId || "",
    recurrenceRule: parseStoredRecurrence(initialValues?.recurrence),
    // Existing events carry reminders or an explicit legacy reminder key; new events default to 15 minutes.
    reminders: normalizeReminderMinutes(
      initialReminders ??
        (initialValues != null && "reminder" in initialValues
          ? [initialValues.reminder ?? 0]
          : [DEFAULT_REMINDER_MINUTES]),
    ),
    participants: initialValues?.participants ?? [],
  };
}

const INITIAL_UI: EventFormUi = {
  openSheet: null,
  dateTimeTarget: "start-time",
  dateTimePickerOpen: false,
  reminderEditIndex: null,
  customRepeatOpen: false,
  fieldErrors: {},
  generalErrors: [],
};

export function useEventFormFields(seed: Parameters<typeof initialFields>[0]) {
  return useReducer(merge<EventFormFields>, seed, initialFields);
}

export function useEventFormUi() {
  return useReducer(merge<EventFormUi>, INITIAL_UI);
}

export type UpdateFields = (update: Update<EventFormFields>) => void;
export type UpdateUi = (update: Update<EventFormUi>) => void;
