// Calendar API types matching backend structure

export type EventColor = "blue" | "orange" | "violet" | "rose" | "emerald";

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
  description?: string | null;
  start: Date;
  end: Date;
  allDay?: boolean;
  location?: string | null;
  color?: string | null;
  calendarId: string;
  calendar?: Calendar | null;
  categoryId?: string | null;
  category?: EventCategory | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
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

// API Request/Response types
export interface EventsResponse {
  events: CalendarEvent[];
  categories: EventCategory[];
  calendars: Calendar[];
}

export interface CalendarsResponse {
  calendars: Calendar[];
}

export interface CategoriesResponse {
  categories: EventCategory[];
}

export interface CreateEventRequest {
  title: string;
  description?: string;
  start: string; // ISO date string
  end: string; // ISO date string
  allDay?: boolean;
  location?: string;
  color?: EventColor;
  calendarId: string;
  categoryId?: string;
}

export interface CreateCalendarRequest {
  name: string;
  color: EventColor;
  isDefault?: boolean;
}

export interface UpdateCalendarRequest extends Partial<CreateCalendarRequest> {
  isVisible?: boolean;
}

export interface UpdateEventRequest extends Partial<CreateEventRequest> {}

export interface CreateCategoryRequest {
  name: string;
  color: EventColor;
}

export interface UpdateCategoryRequest extends Partial<CreateCategoryRequest> {}

export interface DeleteResponse {
  success: boolean;
  message: string;
  deletedEventId?: string;
}

// Error response type
export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  details?: any;
}
