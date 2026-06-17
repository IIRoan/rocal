import { z } from "zod";
import {
  recurrenceRuleSchema,
  recurrenceScopeSchema,
  optionalCalendarColorSchema,
} from "@workspace/calendar-core";
import type { RecurrenceRule } from "../lib/recurrence";
import { strictZodObject } from "../lib/validation";
import { resourceIdParamsSchema } from "./_schemas";
import { resourceIdSchema, userIdField } from "./_zod";

export const validateRecurrenceBodySchema = strictZodObject({
  rule: recurrenceRuleSchema,
});

export const previewRecurrenceBodySchema = strictZodObject({
  eventStart: z.string(),
  eventEnd: z.string(),
  recurrenceRule: recurrenceRuleSchema,
  previewDays: z.number().int().min(7).max(365).optional(),
});

export const editRecurringEventBodySchema = strictZodObject({
  editScope: recurrenceScopeSchema,
  occurrenceDate: z.string().optional(),
  updates: strictZodObject({
    title: z.string().optional(),
    description: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
    allDay: z.boolean().optional(),
    location: z.string().optional(),
    color: optionalCalendarColorSchema,
    reminder: z.number().optional(),
    recurrence: z.string().optional(),
    calendarId: z.string().optional(),
    categoryId: z.string().optional(),
  }),
});

export const deleteRecurringEventQuerySchema = strictZodObject({
  deleteScope: recurrenceScopeSchema,
  occurrenceDate: z.string().optional(),
});

export const recurringEventIdParamsSchema = resourceIdParamsSchema;

export type RecurringRuleInput = z.infer<typeof recurrenceRuleSchema>;

export const recurrencePreviewInputSchema = previewRecurrenceBodySchema;

export const recurringEditInputSchema = editRecurringEventBodySchema.extend({
  ...userIdField,
  eventId: resourceIdSchema,
});

export const recurringDeleteInputSchema =
  deleteRecurringEventQuerySchema.extend({
    ...userIdField,
    eventId: resourceIdSchema,
  });

export type RecurringUpdates = z.infer<
  typeof editRecurringEventBodySchema
>["updates"];

export type RecurrenceValidateResult = {
  valid: boolean;
  errors: string[];
  description: string | null;
  rule?: RecurrenceRule;
};

export type RecurrencePreviewInput = z.infer<
  typeof recurrencePreviewInputSchema
>;
export type RecurrencePreviewResult = {
  instances: Array<{ date: string; isOriginal: boolean }>;
  description: string;
  totalInstances: number;
};

export type RecurringEditInput = z.infer<typeof recurringEditInputSchema>;
export type RecurringDeleteInput = z.infer<typeof recurringDeleteInputSchema>;

export type RecurringDeleteResult = {
  success: boolean;
  message: string;
  deletedEventId: string;
  action: string;
};

export type RecurrencePattern = {
  rule: RecurrenceRule;
  description: string;
};

export interface IRecurringService {
  validate(rule: RecurringRuleInput): RecurrenceValidateResult;
  preview(input: RecurrencePreviewInput): RecurrencePreviewResult;
  editSeries(input: RecurringEditInput): Promise<unknown>;
  deleteSeries(input: RecurringDeleteInput): Promise<RecurringDeleteResult>;
  getCommonPatterns(): {
    patterns: Record<string, RecurrencePattern>;
  };
}
