import { z } from "zod";
import { strictZodObject } from "../lib/validation";
import { userIdField } from "./_zod";

export const pushPlatformSchema = z.enum(["ios", "android"]);
export const pushEnvironmentSchema = z.enum(["sandbox", "production"]);

export const registerPushDeviceBodySchema = strictZodObject({
  token: z.string().trim().min(16).max(4096),
  platform: pushPlatformSchema,
  bundleId: z.enum(["onl.solace.mobile", "onl.solace.mobile.dev"]),
  environment: pushEnvironmentSchema,
});

export const unregisterPushDeviceBodySchema = strictZodObject({
  token: z.string().trim().min(16).max(4096).optional(),
});

export const registerPushDeviceInputSchema =
  registerPushDeviceBodySchema.extend(userIdField);

export const unregisterPushDeviceInputSchema =
  unregisterPushDeviceBodySchema.extend(userIdField);

export type RegisterPushDeviceInput = z.infer<
  typeof registerPushDeviceInputSchema
>;
export type UnregisterPushDeviceInput = z.infer<
  typeof unregisterPushDeviceInputSchema
>;

export type PushDeviceRegistrationResult = {
  success: boolean;
  deviceId: string;
};

export type PushDeviceUnregisterResult = {
  success: boolean;
  deletedCount: number;
};

export type PushTestNotificationInput = {
  userId: string;
};

export type PushTestNotificationResult = {
  success: boolean;
  jobId: string;
};

export interface IPushDeviceService {
  register(input: RegisterPushDeviceInput): Promise<PushDeviceRegistrationResult>;
  unregister(
    input: UnregisterPushDeviceInput,
  ): Promise<PushDeviceUnregisterResult>;
  enqueueTest(
    input: PushTestNotificationInput,
  ): Promise<PushTestNotificationResult>;
}
