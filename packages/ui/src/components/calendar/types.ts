export type CalendarView = "month" | "week" | "day" | "agenda";

export interface Calendar {
  id: string;
  name: string;
  color: EventColor;
  isVisible: boolean;
  isDefault: boolean;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  color?: EventColor;
  label?: string;
  location?: string;
  calendarId: string;
  categoryId?: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  reminder?: number | null;
  // Recurring event fields
  recurrence?: string | null; // JSON string of recurrence rule
  parentEventId?: string | null; // For recurring event instances
  isRecurringInstance?: boolean; // Frontend helper field
  // Sync fields for external calendar events
  isSynced?: boolean;
  externalId?: string | null;
  subscriptionId?: string | null;
  syncedAt?: Date | null;
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

export type EventColor =
  | "blue"
  | "orange"
  | "violet"
  | "rose"
  | "emerald"
  | string;
