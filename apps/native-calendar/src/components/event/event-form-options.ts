import {
  REMINDER_MINUTE_OPTIONS,
  formatReminderShort,
  resolveSubmittedCategoryId,
  type CreateEventRequest,
  type Calendar,
  type EventCategory,
  type RecurrenceRule,
  type RepeatPreset,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { resolveCalendarSwatchColor } from "../../lib/calendar-color-utils";
import type { OptionSheetItem } from "./OptionSheet";
import { buildEventRequest } from "./event-form-utils";
import type { EventFormFields } from "./use-event-form-state";

export function calendarOptionItems(
  calendars: Calendar[],
  selectedId: string,
  swatch: (calendar: Calendar) => string,
  onPick: (calendarId: string) => void,
): OptionSheetItem[] {
  return calendars.map((calendar) => ({
    key: calendar.id,
    label: calendar.name,
    swatch: swatch(calendar),
    selected: calendar.id === selectedId,
    onSelect: () => onPick(calendar.id),
  }));
}

export function categoryOptionItems(
  categories: EventCategory[],
  selectedId: string,
  theme: ThemeTokens,
  onPick: (categoryId: string) => void,
): OptionSheetItem[] {
  return [
    {
      key: "none",
      label: "No category",
      selected: !selectedId,
      onSelect: () => onPick(""),
    },
    ...categories.map((category, index) => ({
      key: category.id,
      label: category.name,
      swatch: resolveCalendarSwatchColor(category.color, theme),
      selected: category.id === selectedId,
      separatorBefore: index === 0,
      onSelect: () => onPick(category.id),
    })),
  ];
}

export function repeatOptionItems({
  presets,
  rule,
  activePresetKey,
  startWeekday,
  onPick,
}: {
  presets: RepeatPreset[];
  rule: RecurrenceRule | null;
  activePresetKey?: string;
  startWeekday: number;
  onPick: (rule: RecurrenceRule | null, custom: boolean) => void;
}): OptionSheetItem[] {
  return [
    {
      key: "none",
      label: "Does not repeat",
      selected: rule === null,
      onSelect: () => onPick(null, false),
    },
    ...presets.map((preset, index) => ({
      key: preset.key,
      label: preset.label,
      selected: activePresetKey === preset.key,
      separatorBefore: index === 0,
      onSelect: () => onPick(preset.rule, false),
    })),
    {
      key: "custom",
      label: "Custom…",
      selected: rule !== null && activePresetKey === undefined,
      separatorBefore: true,
      onSelect: () =>
        onPick(
          rule ?? {
            frequency: "weekly",
            interval: 1,
            byWeekDay: [startWeekday],
          },
          true,
        ),
    },
  ];
}

export function reminderOptionItems(
  reminders: number[],
  editedReminder: number | undefined,
  onPick: (minutes: number) => void,
): OptionSheetItem[] {
  return REMINDER_MINUTE_OPTIONS.flatMap((minutes) =>
    minutes !== editedReminder && reminders.includes(minutes)
      ? []
      : [
          {
            key: String(minutes),
            label: `${formatReminderShort(minutes)} before`,
            selected: minutes === editedReminder,
            onSelect: () => onPick(minutes),
          },
        ],
  );
}

export function eventFormRequest(
  fields: EventFormFields,
  context: {
    calendarId: string;
    color?: string;
    initialCategoryId?: string;
    timezone: string;
  },
): CreateEventRequest {
  return buildEventRequest({
    title: fields.title,
    start: fields.start,
    end: fields.end,
    calendarId: context.calendarId,
    allDay: fields.allDay,
    location: fields.location,
    description: fields.description,
    color: context.color,
    categoryId: resolveSubmittedCategoryId(
      fields.categoryId,
      context.initialCategoryId,
    ),
    recurrence: fields.recurrenceRule
      ? JSON.stringify(fields.recurrenceRule)
      : null,
    // The legacy single field mirrors the earliest reminder for older clients.
    reminder: fields.reminders[0] ?? 0,
    timezone: context.timezone,
    participants: fields.participants.map((participant) => ({
      email: participant.email.trim().toLowerCase(),
      displayName: participant.displayName?.trim() || undefined,
      role: participant.role,
      status: participant.status,
    })),
  });
}
