import type { EventParticipantInput } from "@workspace/calendar-core";

export type EventSearchInput = {
  userId: string;
  query: string;
  blindIndexTokens?: string[];
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
};

export type EventSearchCorpusInput = {
  userId: string;
  limit?: number;
  offset?: number;
  updatedAfter?: string;
};

export type EventListInput = {
  userId: string;
  start: string;
  end: string;
};

export type EventCreateInput = {
  userId: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  allDay?: boolean;
  location?: string;
  color?: string;
  calendarId: string;
  categoryId?: string;
  timezone?: string;
  reminder?: number | null;
  recurrence?: string;
  encryptedContent?: string;
  blindIndexTokens?: string[];
  encryptionKeyVersion?: number;
  participants?: EventParticipantInput[];
};

export type EventSealEncryptionInput = {
  userId: string;
  eventId: string;
  encryptedContent: string;
  blindIndexTokens?: string[];
  encryptionKeyVersion?: number;
};

export type EventUpdateInput = {
  userId: string;
  eventId: string;
  title?: string;
  description?: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  location?: string;
  color?: string;
  calendarId?: string;
  categoryId?: string;
  timezone?: string;
  reminder?: number | null;
  recurrence?: string | null;
  encryptedContent?: string;
  blindIndexTokens?: string[];
  encryptionKeyVersion?: number;
  participants?: EventParticipantInput[];
};

export type EventDeleteResult = {
  success: boolean;
  message: string;
  deletedEventId: string;
};

export type EventBulkInput = {
  userId: string;
  action: "move" | "delete" | "duplicate";
  eventIds: string[];
  targetCalendarId?: string;
};

export type EventBulkResult = {
  success: boolean;
  message: string;
  eventsProcessed: number;
  action: string;
  createdEvents?: unknown[];
};

export type EventIcsExportResult = {
  icsContent: string;
  filename: string;
};

export interface IEventService {
  search(
    input: EventSearchInput,
  ): Promise<{ events: unknown[]; total: number }>;
  searchCorpus(
    input: EventSearchCorpusInput,
  ): Promise<{ events: unknown[]; total: number; nextOffset: number | null }>;
  list(
    input: EventListInput,
  ): Promise<{
    events: unknown[];
    categories: unknown[];
    calendars: unknown[];
  }>;
  getById(userId: string, eventId: string): Promise<unknown>;
  create(input: EventCreateInput): Promise<unknown>;
  update(input: EventUpdateInput): Promise<unknown>;
  sealEncryption(input: EventSealEncryptionInput): Promise<unknown>;
  delete(userId: string, eventId: string): Promise<EventDeleteResult>;
  bulkAction(input: EventBulkInput): Promise<EventBulkResult>;
  exportIcs(userId: string, eventId: string): Promise<EventIcsExportResult>;
}
