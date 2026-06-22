import { z } from "zod";
import {
  calendarDeleteActionSchema,
  calendarColorSchema,
  optionalCalendarColorSchema,
} from "@workspace/calendar-core";
import type { Calendar } from "../generated/prisma/index.js";
import { strictZodObject } from "../lib/validation";
import { rowEncryptionStateSchema } from "../lib/encryption-state";
import { resourceIdParamsSchema } from "./_schemas";
import { resourceIdSchema, userIdField, userIdSchema } from "./_zod";

export const createCalendarBodySchema = strictZodObject({
  name: z.string().min(1).max(100),
  color: calendarColorSchema,
  isDefault: z.boolean().optional(),
  encryptedName: z.string().optional(),
  blindIndexTokens: z.array(z.string()).optional(),
  encryptionState: rowEncryptionStateSchema.optional(),
  encryptionKeyVersion: z.number().int().min(1).optional(),
  forceFullEncryption: z.boolean().optional(),
});

export const updateCalendarBodySchema = strictZodObject({
  name: z.string().min(1).max(100).optional(),
  color: optionalCalendarColorSchema,
  isVisible: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  encryptedName: z.string().optional(),
  blindIndexTokens: z.array(z.string()).optional(),
  encryptionState: rowEncryptionStateSchema.optional(),
  encryptionKeyVersion: z.number().int().min(1).optional(),
  forceFullEncryption: z.boolean().optional(),
});

export const deleteCalendarQuerySchema = strictZodObject({
  action: calendarDeleteActionSchema.optional(),
  targetCalendarId: z.string().optional(),
});

export const calendarIdParamsSchema = resourceIdParamsSchema;

export const shareTokenParamsSchema = strictZodObject({
  token: z.string().min(1),
});

export const shareLinkBodySchema = strictZodObject({
  regenerate: z.boolean().optional(),
});

/** Entire request body may be omitted (e.g. enable without rotating token). */
export const optionalShareLinkBodySchema = z.preprocess(
  (value) => value ?? {},
  shareLinkBodySchema,
);

export const calendarCreateInputSchema =
  createCalendarBodySchema.extend(userIdField);

export const calendarUpdateInputSchema = updateCalendarBodySchema.extend({
  ...userIdField,
  calendarId: resourceIdSchema,
});

export const calendarDeleteInputSchema = deleteCalendarQuerySchema.extend({
  ...userIdField,
  calendarId: resourceIdSchema,
});

export const shareLinkInputSchema = z
  .object({
    userId: userIdSchema,
    calendarId: resourceIdSchema,
    baseUrl: z.string().min(1),
  })
  .strict();

export const createShareLinkInputSchema = shareLinkInputSchema.extend({
  regenerate: z.boolean().optional(),
});

export type CalendarCreateInput = z.infer<typeof calendarCreateInputSchema>;
export type CalendarUpdateInput = z.infer<typeof calendarUpdateInputSchema>;
export type CalendarDeleteInput = z.infer<typeof calendarDeleteInputSchema>;
export type ShareLinkInput = z.infer<typeof shareLinkInputSchema>;
export type CreateShareLinkInput = z.infer<typeof createShareLinkInputSchema>;

export type CalendarDeleteResult = {
  success: boolean;
  message: string;
  deletedCalendarId: string;
  eventsAffected: number;
  action: string;
};

export interface ICalendarService {
  list(userId: string): Promise<{ calendars: Calendar[] }>;
  create(input: CalendarCreateInput): Promise<Calendar>;
  update(input: CalendarUpdateInput): Promise<Calendar>;
  delete(input: CalendarDeleteInput): Promise<CalendarDeleteResult>;
}
