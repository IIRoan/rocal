import { z } from "zod";
import {
  bulkEventActionSchema,
  eventParticipantInputSchema,
  invitationImportStatusSchema,
  optionalCalendarColorSchema,
  rsvpStatusSchema,
} from "@workspace/calendar-core";
import { strictZodObject } from "../lib/validation";
import {
  eventContentEncryptionFieldsSchema,
  reminderFieldSchema,
  resourceIdParamsSchema,
  sealEncryptionBodySchema,
} from "./_schemas";
import {
  optionalQueryBooleanSchema,
  optionalQueryInt,
  resourceIdSchema,
  userIdField,
  userIdSchema,
} from "./_zod";

export const eventRouteParamsSchema = resourceIdParamsSchema;

export const eventSearchQuerySchema = strictZodObject({
  q: z.string().min(2),
  limit: optionalQueryInt({ min: 1, max: 50 }),
  blindIndexTokens: z.string().optional(),
  offset: optionalQueryInt({ min: 0 }),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const eventSearchCorpusQuerySchema = strictZodObject({
  limit: optionalQueryInt({ min: 1, max: 200 }),
  offset: optionalQueryInt({ min: 0 }),
  updatedAfter: z.string().optional(),
});

export const eventDateRangeQuerySchema = strictZodObject({
  start: z.string(),
  end: z.string(),
});

const eventWritableFieldsSchema = {
  title: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  start: z.string(),
  end: z.string(),
  allDay: z.boolean().optional(),
  location: z.string().max(255).optional(),
  color: optionalCalendarColorSchema,
  calendarId: z.string(),
  categoryId: z.string().optional(),
  timezone: z.string().optional(),
  reminder: reminderFieldSchema.optional(),
  recurrence: z.string().optional(),
  ...eventContentEncryptionFieldsSchema.shape,
  participants: z.array(eventParticipantInputSchema).optional(),
};

export const createEventBodySchema = strictZodObject(eventWritableFieldsSchema);

export const updateEventBodySchema = strictZodObject({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  timezone: z.string().optional(),
  allDay: z.boolean().optional(),
  location: z.string().max(255).optional(),
  color: optionalCalendarColorSchema,
  calendarId: z.string().optional(),
  categoryId: z.string().optional(),
  reminder: reminderFieldSchema.optional(),
  recurrence: z.union([z.string(), z.null()]).optional(),
  ...eventContentEncryptionFieldsSchema.shape,
  participants: z.array(eventParticipantInputSchema).optional(),
});

export const invitationByExternalIdQuerySchema = strictZodObject({
  externalId: z.string().min(1).max(512),
  syncRemote: optionalQueryBooleanSchema,
});

export const invitationEncryptionEntrySchema = strictZodObject({
  externalId: z.string().min(1).max(512),
  encryptedContent: z.string().min(1),
  blindIndexTokens: z.array(z.string().min(1)).optional(),
  encryptionKeyVersion: z.number().int().min(1).optional(),
});

export const importIcsBodySchema = strictZodObject({
  icsContent: z.string().min(1).max(1_048_576),
  status: invitationImportStatusSchema.optional(),
  calendarId: z.string().min(1).max(64).optional(),
  encryption: z.array(invitationEncryptionEntrySchema).optional(),
});

export const declineIcsBodySchema = strictZodObject({
  icsContent: z.string().min(1).max(1_048_576),
});

export const rsvpBodySchema = strictZodObject({
  status: rsvpStatusSchema,
});

export const bulkEventBodySchema = strictZodObject({
  action: bulkEventActionSchema,
  eventIds: z.array(z.string()).min(1),
  targetCalendarId: z.string().optional(),
});

export { sealEncryptionBodySchema };

export const eventSearchInputSchema = eventSearchQuerySchema
  .omit({ q: true, blindIndexTokens: true })
  .extend({
    userId: userIdSchema,
    query: z.string().min(2),
    blindIndexTokens: z.array(z.string()).optional(),
  });

export const eventSearchCorpusInputSchema =
  eventSearchCorpusQuerySchema.extend(userIdField);

export const eventListInputSchema = eventDateRangeQuerySchema.extend(userIdField);

export const eventCreateInputSchema = createEventBodySchema.extend(userIdField);

export const eventUpdateInputSchema = updateEventBodySchema.extend({
  ...userIdField,
  eventId: resourceIdSchema,
});

export const eventSealEncryptionInputSchema = sealEncryptionBodySchema.extend({
  ...userIdField,
  eventId: resourceIdSchema,
});

export const eventBulkInputSchema = bulkEventBodySchema.extend(userIdField);

export type EventSearchInput = z.infer<typeof eventSearchInputSchema>;
export type EventSearchCorpusInput = z.infer<typeof eventSearchCorpusInputSchema>;
export type EventListInput = z.infer<typeof eventListInputSchema>;
export type EventCreateInput = z.infer<typeof eventCreateInputSchema>;
export type EventUpdateInput = z.infer<typeof eventUpdateInputSchema>;
export type EventSealEncryptionInput = z.infer<
  typeof eventSealEncryptionInputSchema
>;
export type EventBulkInput = z.infer<typeof eventBulkInputSchema>;

export type EventDeleteResult = {
  success: boolean;
  message: string;
  deletedEventId: string;
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
  getInvitationByExternalId(
    userId: string,
    externalId: string,
    options?: { syncRemote?: boolean },
  ): Promise<unknown | null>;
  create(input: EventCreateInput): Promise<unknown>;
  update(input: EventUpdateInput): Promise<unknown>;
  respondToInvitation(input: {
    userId: string;
    eventId: string;
    status: z.infer<typeof rsvpBodySchema>["status"];
  }): Promise<unknown>;
  sealEncryption(input: EventSealEncryptionInput): Promise<unknown>;
  delete(userId: string, eventId: string): Promise<EventDeleteResult>;
  bulkAction(input: EventBulkInput): Promise<EventBulkResult>;
  exportIcs(userId: string, eventId: string): Promise<EventIcsExportResult>;
}
