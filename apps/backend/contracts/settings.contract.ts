import { z } from "zod";
import {
  defaultViewSchema,
  eventEncryptionModeSchema,
  themeSchema,
  timeFormatSchema,
} from "@workspace/calendar-core";
import type { UserSettings as PrismaUserSettings } from "../generated/prisma/index.js";
import { strictZodObject } from "../lib/validation";
import { userIdField } from "./_zod";

export const updateSettingsBodySchema = strictZodObject({
  theme: themeSchema.optional(),
  defaultView: defaultViewSchema.optional(),
  weekStartDay: z.number().int().min(0).max(6).optional(),
  timezone: z.string().optional(),
  timeFormat: timeFormatSchema.optional(),
  workingHoursStart: z.number().int().min(0).max(1440).optional(),
  workingHoursEnd: z.number().int().min(0).max(1440).optional(),
  workingDays: z.string().optional(),
  emailNotifications: z.boolean().optional(),
  browserNotifications: z.boolean().optional(),
  reminderSound: z.boolean().optional(),
  eventEncryptionMode: eventEncryptionModeSchema.optional(),
  defaultEventDuration: z.number().int().min(1).optional(),
  defaultCalendarId: z.union([z.string(), z.null()]).optional(),
  compactView: z.boolean().optional(),
  showWeekNumbers: z.boolean().optional(),
  showDeclinedEvents: z.boolean().optional(),
});

export const settingsUpdateInputSchema =
  updateSettingsBodySchema.extend(userIdField);

export type PublicUserSettings = Omit<PrismaUserSettings, "defaultReminder">;
export type SettingsUpdateInput = z.infer<typeof settingsUpdateInputSchema>;

export interface ISettingsService {
  get(userId: string): Promise<PublicUserSettings>;
  update(input: SettingsUpdateInput): Promise<PublicUserSettings>;
  reset(userId: string): Promise<{ success: boolean; message: string }>;
}
