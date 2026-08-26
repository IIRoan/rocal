import { z } from "zod";
import {
  listPushDevicesResultSchema,
  pushDeviceRegistrationResultSchema,
  pushDeviceSummarySchema,
  pushDeviceUnregisterResultSchema,
  pushTestNotificationResultSchema,
  registerPushDeviceRequestSchema,
  unregisterPushDeviceRequestSchema,
  type ListPushDevicesResult,
  type PushDeviceRegistrationResult,
  type PushDeviceSummary,
  type PushDeviceUnregisterResult,
  type PushTestNotificationResult,
} from "@workspace/calendar-core";
import { strictZodObject } from "../lib/validation";
import { userIdField } from "./_zod";

/** Route body — same fields as calendar-core, via strictZodObject for Elysia. */
export const registerPushDeviceBodySchema = strictZodObject(
  registerPushDeviceRequestSchema.shape,
);

export const unregisterPushDeviceBodySchema = strictZodObject(
  unregisterPushDeviceRequestSchema.shape,
);

export const registerPushDeviceInputSchema =
  registerPushDeviceBodySchema.extend(userIdField);

export const unregisterPushDeviceInputSchema =
  unregisterPushDeviceBodySchema.extend(userIdField);

export const listPushDevicesInputSchema = strictZodObject(userIdField);

export type RegisterPushDeviceInput = z.infer<
  typeof registerPushDeviceInputSchema
>;
export type UnregisterPushDeviceInput = z.infer<
  typeof unregisterPushDeviceInputSchema
>;
export type ListPushDevicesInput = z.infer<typeof listPushDevicesInputSchema>;

export type {
  PushDeviceRegistrationResult,
  PushDeviceUnregisterResult,
  PushDeviceSummary,
  ListPushDevicesResult,
  PushTestNotificationResult,
};

export type PushTestNotificationInput = {
  userId: string;
};

export {
  listPushDevicesResultSchema,
  pushDeviceRegistrationResultSchema,
  pushDeviceSummarySchema,
  pushDeviceUnregisterResultSchema,
  pushTestNotificationResultSchema,
};

export interface IPushDeviceService {
  register(
    input: RegisterPushDeviceInput,
  ): Promise<PushDeviceRegistrationResult>;
  unregister(
    input: UnregisterPushDeviceInput,
  ): Promise<PushDeviceUnregisterResult>;
  list(input: ListPushDevicesInput): Promise<ListPushDevicesResult>;
  enqueueTest(
    input: PushTestNotificationInput,
  ): Promise<PushTestNotificationResult>;
}
