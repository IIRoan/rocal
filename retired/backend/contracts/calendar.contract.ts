import { z } from "zod";
import {
  calendarDeleteActionSchema,
  calendarColorSchema,
  optionalCalendarColorSchema,
} from "@workspace/calendar-core";
import type { Calendar } from "../generated/prisma/index.js";
import { strictZodObject } from "../lib/validation";
import {
  encryptionShadowFieldsSchema,
  refineEncryptedNameBody,
  resourceIdParamsSchema,
} from "./_schemas";
import { resourceIdSchema, userIdField, userIdSchema } from "./_zod";

const createCalendarBodyFieldsSchema = strictZodObject({
  name: z.string().max(100).optional(),
  color: calendarColorSchema,
  isDefault: z.boolean().optional(),
  ...encryptionShadowFieldsSchema.shape,
  forceFullEncryption: z.boolean().optional(),
});

const updateCalendarBodyFieldsSchema = strictZodObject({
  name: z.string().max(100).optional(),
  color: optionalCalendarColorSchema,
  isVisible: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  ...encryptionShadowFieldsSchema.shape,
  forceFullEncryption: z.boolean().optional(),
});

export const createCalendarBodySchema = createCalendarBodyFieldsSchema.superRefine(
  refineEncryptedNameBody({ entityLabel: "Calendar", requireName: true }),
);

export const updateCalendarBodySchema = updateCalendarBodyFieldsSchema.superRefine(
  refineEncryptedNameBody({ entityLabel: "Calendar", requireName: false }),
);

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
  createCalendarBodyFieldsSchema.extend(userIdField);

export const calendarUpdateInputSchema = updateCalendarBodyFieldsSchema.extend({
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
