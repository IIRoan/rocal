export interface User {
  id?: string;
  name: string;
  email: string;
  avatar?: string;
  hasAiAccess?: boolean;
}

export type CalendarView = "month" | "week" | "day" | "agenda";

export type EventColor =
  | "blue"
  | "orange"
  | "violet"
  | "rose"
  | "emerald"
  | string;

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
  timezone?: string | null;
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
  recurrence?: string | null;
  parentEventId?: string | null;
  isRecurringInstance?: boolean;
  isSynced?: boolean;
  externalId?: string | null;
  subscriptionId?: string | null;
  syncedAt?: Date | null;
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

export interface EventCategory {
  id: string;
  name: string;
  color: string;
  isActive: boolean;
  userId: string;
  usageCount?: number;
  createdAt: Date;
  updatedAt: Date;
}
