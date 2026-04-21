export interface User {
  id?: string;
  name: string;
  email: string;
  avatar?: string;
}

export type CalendarView = "month" | "week" | "3day" | "day" | "agenda";

export const CALENDAR_VIEWS: readonly CalendarView[] = [
  "month",
  "week",
  "3day",
  "day",
  "agenda",
];

export interface Calendar {
  id: string;
  name: string;
  color: EventColor;
  kind: "owned" | "subscribed" | "public_holiday";
  isPublic: boolean;
  isVisible: boolean;
  isDefault: boolean;
  isSyncOnly: boolean;
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
  // Recurring event fields
  recurrence?: string | null; // JSON string of recurrence rule
  parentEventId?: string | null; // For recurring event instances
  isRecurringInstance?: boolean; // Frontend helper field
  // Sync fields for external calendar events
  isSynced?: boolean;
  externalId?: string | null;
  subscriptionId?: string | null;
  syncedAt?: Date | null;
  // Preview event (ghost event shown in timeline while creating via popover)
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

export type EventColor =
  | "blue"
  | "orange"
  | "violet"
  | "rose"
  | "emerald"
  | "red"
  | "cyan"
  | "lime"
  | "amber"
  | "indigo"
  | "pink"
  | "teal"
  | string;
