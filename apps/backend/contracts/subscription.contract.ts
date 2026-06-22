import { z } from "zod";
import type { Prisma } from "../generated/prisma/index.js";
import type {
  CalendarSubscriptionSyncResponse,
  ImportIcsResponse,
} from "@workspace/calendar-ics";
import { optionalCalendarColorSchema } from "@workspace/calendar-core";
import { strictZodObject } from "../lib/validation";
import { resourceIdParamsSchema } from "./_schemas";
import { optionalQueryBooleanSchema, resourceIdSchema, userIdField } from "./_zod";

export const createSubscriptionBodySchema = strictZodObject({
  name: z.string().min(1),
  url: z.string().url(),
  color: optionalCalendarColorSchema,
});

export const updateSubscriptionBodySchema = strictZodObject({
  name: z.string().optional(),
  color: optionalCalendarColorSchema,
  isActive: z.boolean().optional(),
  syncIntervalMinutes: z.number().int().min(5).max(1440).optional(),
});

export const deleteSubscriptionQuerySchema = strictZodObject({
  deleteEvents: optionalQueryBooleanSchema,
});

export const importIcsSubscriptionBodySchema = strictZodObject({
  calendarId: z.string().min(1),
  icsContent: z.string().min(1),
  fileName: z.string().optional(),
});

export const subscriptionIdParamsSchema = resourceIdParamsSchema;

export const subscriptionCreateInputSchema =
  createSubscriptionBodySchema.extend(userIdField);

export const subscriptionUpdateInputSchema = updateSubscriptionBodySchema.extend(
  {
    ...userIdField,
    subscriptionId: resourceIdSchema,
  },
);

export const subscriptionDeleteInputSchema = z
  .object({
    userId: userIdField.userId,
    subscriptionId: resourceIdSchema,
    deleteEvents: z.boolean().default(false),
  })
  .strict();

export const subscriptionSyncInputSchema = z
  .object({
    userId: userIdField.userId,
    subscriptionId: resourceIdSchema,
  })
  .strict();

export const importIcsInputSchema =
  importIcsSubscriptionBodySchema.extend(userIdField);

export type SyncableSubscription = Prisma.CalendarSubscriptionGetPayload<{
  include: { calendar: true };
}>;

export type SubscriptionCreateInput = z.infer<
  typeof subscriptionCreateInputSchema
>;
export type SubscriptionUpdateInput = z.infer<
  typeof subscriptionUpdateInputSchema
>;
export type SubscriptionDeleteInput = z.infer<
  typeof subscriptionDeleteInputSchema
>;
export type SubscriptionSyncInput = z.infer<typeof subscriptionSyncInputSchema>;
export type ImportIcsInput = z.infer<typeof importIcsInputSchema>;

export interface ISubscriptionService {
  list(userId: string): Promise<unknown[]>;
  create(input: SubscriptionCreateInput): Promise<unknown>;
  update(input: SubscriptionUpdateInput): Promise<unknown>;
  delete(input: SubscriptionDeleteInput): Promise<{ success: boolean }>;
  sync(input: SubscriptionSyncInput): Promise<CalendarSubscriptionSyncResponse>;
  importIcs(input: ImportIcsInput): Promise<ImportIcsResponse>;
}

export { type CalendarSubscriptionSyncResponse };
