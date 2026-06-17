import { z } from "zod";
import {
  calendarColorSchema,
  optionalCalendarColorSchema,
} from "@workspace/calendar-core";
import type { EventCategory } from "../generated/prisma/index.js";
import { strictZodObject } from "../lib/validation";
import {
  encryptionShadowFieldsSchema,
  resourceIdParamsSchema,
} from "./_schemas";
import { resourceIdSchema, userIdField } from "./_zod";

export const createCategoryBodySchema = strictZodObject({
  name: z.string().min(1),
  color: calendarColorSchema,
  ...encryptionShadowFieldsSchema.shape,
});

export const updateCategoryBodySchema = strictZodObject({
  name: z.string().optional(),
  color: optionalCalendarColorSchema,
  ...encryptionShadowFieldsSchema.shape,
});

export const categoryIdParamsSchema = resourceIdParamsSchema;

export const categoryCreateInputSchema =
  createCategoryBodySchema.extend(userIdField);

export const categoryUpdateInputSchema = updateCategoryBodySchema.extend({
  ...userIdField,
  categoryId: resourceIdSchema,
});

export const categoryDeleteInputSchema = z
  .object({
    userId: userIdField.userId,
    categoryId: resourceIdSchema,
  })
  .strict();

export type CategoryWithCount = EventCategory & { usageCount: number };
export type CategoryCreateInput = z.infer<typeof categoryCreateInputSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateInputSchema>;
export type CategoryDeleteInput = z.infer<typeof categoryDeleteInputSchema>;

export interface ICategoryService {
  list(userId: string): Promise<{ categories: CategoryWithCount[] }>;
  create(input: CategoryCreateInput): Promise<EventCategory>;
  update(input: CategoryUpdateInput): Promise<EventCategory>;
  delete(
    input: CategoryDeleteInput,
  ): Promise<{ success: boolean; message: string }>;
}
