import { z } from "zod";
import {
  calendarColorSchema,
  optionalCalendarColorSchema,
} from "@workspace/calendar-core";
import type { EventCategory } from "../generated/prisma/index.js";
import { strictZodObject } from "../lib/validation";
import {
  encryptionShadowFieldsSchema,
  refineEncryptedNameBody,
  resourceIdParamsSchema,
} from "./_schemas";
import { resourceIdSchema, userIdField } from "./_zod";

const createCategoryBodyFieldsSchema = strictZodObject({
  name: z.string().optional(),
  color: calendarColorSchema,
  ...encryptionShadowFieldsSchema.shape,
});

const updateCategoryBodyFieldsSchema = strictZodObject({
  name: z.string().optional(),
  color: optionalCalendarColorSchema,
  ...encryptionShadowFieldsSchema.shape,
});

export const createCategoryBodySchema = createCategoryBodyFieldsSchema.superRefine(
  refineEncryptedNameBody({ entityLabel: "Category", requireName: true }),
);

export const updateCategoryBodySchema = updateCategoryBodyFieldsSchema.superRefine(
  refineEncryptedNameBody({ entityLabel: "Category", requireName: false }),
);

export const categoryIdParamsSchema = resourceIdParamsSchema;

export const categoryCreateInputSchema =
  createCategoryBodyFieldsSchema.extend(userIdField);

export const categoryUpdateInputSchema = updateCategoryBodyFieldsSchema.extend({
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
