import { z } from "zod";
import { CALENDAR_COLORS, isValidCalendarColor } from "./color-utils";

const PARTICIPANT_EMAIL_REGEX =
  /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

export const encryptionStateSchema = z.enum([
  "plaintext",
  "shadow_write",
  "encrypted",
]);
export type EncryptionState = z.infer<typeof encryptionStateSchema>;

export const eventEncryptionModeSchema = z.enum(["hybrid", "full"]);
export type EventEncryptionMode = z.infer<typeof eventEncryptionModeSchema>;

export const eventParticipantRoleSchema = z.enum(["organizer", "attendee"]);
export type EventParticipantRole = z.infer<typeof eventParticipantRoleSchema>;

export const eventParticipantStatusSchema = z.enum([
  "pending",
  "accepted",
  "declined",
  "tentative",
]);
export type EventParticipantStatus = z.infer<typeof eventParticipantStatusSchema>;

export const rsvpStatusSchema = z.enum(["accepted", "declined", "tentative"]);
export type RsvpStatus = z.infer<typeof rsvpStatusSchema>;

export const invitationImportStatusSchema = z.enum(["accepted", "tentative"]);

export const recurrenceFrequencySchema = z.enum([
  "daily",
  "weekly",
  "monthly",
  "yearly",
]);

export const recurrenceRuleObjectSchema = z
  .object({
    frequency: recurrenceFrequencySchema,
    interval: z.number().int().min(1).max(999),
    count: z.number().int().min(1).optional(),
    until: z.string().optional(),
    timezone: z.string().optional(),
    byWeekDay: z.array(z.number().int().min(0).max(6)).optional(),
    byMonthDay: z.array(z.number().int().min(1).max(31)).optional(),
    byMonth: z.array(z.number().int().min(1).max(12)).optional(),
  })
  .strict();

export const recurrenceRuleSchema = z.union([
  z.string(),
  recurrenceRuleObjectSchema,
]);

export const recurrenceScopeSchema = z.enum([
  "this_only",
  "this_and_future",
  "all",
]);
export type RecurrenceScope = z.infer<typeof recurrenceScopeSchema>;

export const eventParticipantInputSchema = z
  .object({
    email: z.string().min(3).max(320).regex(PARTICIPANT_EMAIL_REGEX),
    displayName: z.string().max(120).optional(),
    role: eventParticipantRoleSchema.optional(),
    status: eventParticipantStatusSchema.optional(),
  })
  .strict();

export type EventParticipantInput = z.infer<typeof eventParticipantInputSchema>;

export const calendarDeleteActionSchema = z.enum([
  "delete_events",
  "move_events",
]);

export const bulkEventActionSchema = z.enum(["move", "delete", "duplicate"]);

export const notificationTypeSchema = z.enum(["browser", "email"]);

export const themeSchema = z.enum(["light", "dark", "system"]);
export const defaultViewSchema = z.enum(["month", "week", "day", "agenda"]);
export const timeFormatSchema = z.enum(["12h", "24h"]);

const calendarColorMessage = `Color must be one of: ${CALENDAR_COLORS.join(", ")} or a valid hex color (e.g., #FF0000)`;

export const calendarColorSchema = z
  .string()
  .refine(isValidCalendarColor, { message: calendarColorMessage });

export const optionalCalendarColorSchema = calendarColorSchema.optional();
