import {
  CALENDAR_VIEWS as CORE_CALENDAR_VIEWS,
  type Calendar as CoreCalendar,
  type CalendarEvent as CoreCalendarEvent,
  type CalendarView as CoreCalendarView,
  type EncryptionState as CoreEncryptionState,
  type EventColor as CoreEventColor,
} from "@workspace/calendar-core";

export interface User {
  id?: string;
  name: string;
  email: string;
  avatar?: string;
}

export type EncryptionState = CoreEncryptionState;

export type CalendarView = CoreCalendarView;

export const CALENDAR_VIEWS: readonly CalendarView[] = CORE_CALENDAR_VIEWS;

export type Calendar = CoreCalendar;

export interface CalendarEvent extends Omit<CoreCalendarEvent, "color"> {
  color?: EventColor;
  label?: string;
  isPreview?: boolean;
}

export interface CreateCalendarData {
  name: string;
  color: EventColor;
  isDefault?: boolean;
}

export interface CreateEventData {
  title: string;
  description?: string;
  start: Date | string;
  end: Date | string;
  allDay?: boolean;
  color?: EventColor;
  location?: string;
  calendarId: string;
  categoryId?: string;
  reminder?: number | null;
}

export type EventColor = CoreEventColor;
