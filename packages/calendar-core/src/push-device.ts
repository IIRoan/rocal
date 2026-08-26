import { z } from "zod";

export const SOLACE_IOS_PRODUCTION_BUNDLE_ID = "onl.solace.mobile" as const;
export const SOLACE_IOS_DEV_BUNDLE_ID = "onl.solace.mobile.dev" as const;

export const SOLACE_IOS_BUNDLE_IDS = [
  SOLACE_IOS_PRODUCTION_BUNDLE_ID,
  SOLACE_IOS_DEV_BUNDLE_ID,
] as const;

export type SolaceIosBundleId = (typeof SOLACE_IOS_BUNDLE_IDS)[number];

export const pushPlatformSchema = z.enum(["ios", "android"]);
export type PushPlatform = z.infer<typeof pushPlatformSchema>;

export const pushEnvironmentSchema = z.enum(["sandbox", "production"]);
export type PushEnvironment = z.infer<typeof pushEnvironmentSchema>;

export const pushBundleIdSchema = z.enum(SOLACE_IOS_BUNDLE_IDS);
export type PushBundleId = z.infer<typeof pushBundleIdSchema>;

export const registerPushDeviceRequestSchema = z
  .object({
    token: z.string().trim().min(16).max(4096),
    platform: pushPlatformSchema,
    bundleId: pushBundleIdSchema,
    environment: pushEnvironmentSchema,
  })
  .strict();

export type RegisterPushDeviceRequest = z.infer<
  typeof registerPushDeviceRequestSchema
>;

export const unregisterPushDeviceRequestSchema = z
  .object({
    token: z.string().trim().min(16).max(4096).optional(),
  })
  .strict();

export type UnregisterPushDeviceRequest = z.infer<
  typeof unregisterPushDeviceRequestSchema
>;

export const pushDeviceSummarySchema = z
  .object({
    id: z.string().min(1),
    platform: pushPlatformSchema,
    bundleId: z.string().min(1),
    environment: pushEnvironmentSchema,
    isEnabled: z.boolean(),
    lastSeenAt: z.string().min(1),
    createdAt: z.string().min(1),
  })
  .strict();

export type PushDeviceSummary = z.infer<typeof pushDeviceSummarySchema>;

export const listPushDevicesResultSchema = z
  .object({
    devices: z.array(pushDeviceSummarySchema),
  })
  .strict();

export type ListPushDevicesResult = z.infer<typeof listPushDevicesResultSchema>;

export const pushDeviceRegistrationResultSchema = z
  .object({
    success: z.boolean(),
    deviceId: z.string().min(1),
  })
  .strict();

export type PushDeviceRegistrationResult = z.infer<
  typeof pushDeviceRegistrationResultSchema
>;

export const pushDeviceUnregisterResultSchema = z
  .object({
    success: z.boolean(),
    deletedCount: z.number().int().nonnegative(),
  })
  .strict();

export type PushDeviceUnregisterResult = z.infer<
  typeof pushDeviceUnregisterResultSchema
>;

export const pushTestNotificationResultSchema = z
  .object({
    success: z.boolean(),
    jobId: z.string().min(1),
  })
  .strict();

export type PushTestNotificationResult = z.infer<
  typeof pushTestNotificationResultSchema
>;

/** Shared React Query key for registered push devices. */
export const PUSH_DEVICES_QUERY_KEY = ["push-devices"] as const;

export function isSolaceIosBundleId(
  bundleId: string | null | undefined,
): bundleId is SolaceIosBundleId {
  return (
    bundleId === SOLACE_IOS_PRODUCTION_BUNDLE_ID ||
    bundleId === SOLACE_IOS_DEV_BUNDLE_ID
  );
}
