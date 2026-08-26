import type { Prisma, PrismaClient } from "../generated/prisma/index.js";
import type {
  IPushDeviceService,
  ListPushDevicesInput,
  ListPushDevicesResult,
  PushDeviceRegistrationResult,
  PushDeviceSummary,
  PushDeviceUnregisterResult,
  PushTestNotificationInput,
  PushTestNotificationResult,
  RegisterPushDeviceInput,
  UnregisterPushDeviceInput,
} from "../contracts/push-device.contract";
import { pushDeviceSummarySchema } from "../contracts/push-device.contract";
import { ValidationError } from "../lib/errors";
import { eventReminderPayload } from "../lib/notification-job";
import { hashPushToken } from "../lib/push-token";

const TEST_NOTIFICATION_EVENT_ID = "test-notification";
const TEST_NOTIFICATION_MINUTES_BEFORE = 15;

function toPublicPushDevice(device: {
  id: string;
  platform: string;
  bundleId: string;
  environment: string;
  isEnabled: boolean;
  lastSeenAt: Date;
  createdAt: Date;
}): PushDeviceSummary {
  return pushDeviceSummarySchema.parse({
    id: device.id,
    platform: device.platform,
    bundleId: device.bundleId,
    environment: device.environment,
    isEnabled: device.isEnabled,
    lastSeenAt: device.lastSeenAt.toISOString(),
    createdAt: device.createdAt.toISOString(),
  });
}

export class PushDeviceService implements IPushDeviceService {
  constructor(private readonly prisma: PrismaClient) {}

  async register(
    input: RegisterPushDeviceInput,
  ): Promise<PushDeviceRegistrationResult> {
    const token = input.token.trim();
    const tokenHash = hashPushToken(token);
    const now = new Date();

    const existingByHash = await this.prisma.pushDevice.findUnique({
      where: { tokenHash },
    });

    if (existingByHash && existingByHash.userId !== input.userId) {
      await this.prisma.pushDevice.delete({
        where: { id: existingByHash.id },
      });
    }

    // Keep the APNs host the worker learned. Dev clients often guess sandbox.
    const device = await this.prisma.pushDevice.upsert({
      where: {
        userId_tokenHash: {
          userId: input.userId,
          tokenHash,
        },
      },
      create: {
        userId: input.userId,
        platform: input.platform,
        bundleId: input.bundleId,
        environment: input.environment,
        token,
        tokenHash,
        isEnabled: true,
        lastSeenAt: now,
      },
      update: {
        platform: input.platform,
        bundleId: input.bundleId,
        token,
        isEnabled: true,
        lastSeenAt: now,
      },
    });

    return {
      success: true,
      deviceId: device.id,
    };
  }

  async unregister(
    input: UnregisterPushDeviceInput,
  ): Promise<PushDeviceUnregisterResult> {
    if (input.token) {
      const result = await this.prisma.pushDevice.deleteMany({
        where: {
          userId: input.userId,
          tokenHash: hashPushToken(input.token),
        },
      });
      return { success: true, deletedCount: result.count };
    }

    const result = await this.prisma.pushDevice.deleteMany({
      where: { userId: input.userId },
    });
    return { success: true, deletedCount: result.count };
  }

  async list(input: ListPushDevicesInput): Promise<ListPushDevicesResult> {
    const devices = await this.prisma.pushDevice.findMany({
      where: { userId: input.userId, isEnabled: true },
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        platform: true,
        bundleId: true,
        environment: true,
        isEnabled: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });

    return {
      devices: devices.map(toPublicPushDevice),
    };
  }

  async enqueueTest(
    input: PushTestNotificationInput,
  ): Promise<PushTestNotificationResult> {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId: input.userId },
      select: { pushNotifications: true },
    });
    if (settings?.pushNotifications === false) {
      throw new ValidationError(
        "App notifications are turned off. Enable them before sending a test.",
      );
    }

    const deviceCount = await this.prisma.pushDevice.count({
      where: { userId: input.userId, isEnabled: true },
    });
    if (deviceCount < 1) {
      throw new ValidationError(
        "No iPhone is registered for push yet. Open Solace on your phone with notifications allowed.",
      );
    }

    const payload = eventReminderPayload({
      eventId: TEST_NOTIFICATION_EVENT_ID,
      minutesBefore: TEST_NOTIFICATION_MINUTES_BEFORE,
      title: "Solace",
    });

    const job = await this.prisma.notificationJob.create({
      data: {
        userId: input.userId,
        kind: "event_reminder",
        channel: "push",
        eventId: TEST_NOTIFICATION_EVENT_ID,
        payload: payload as Prisma.InputJsonValue,
        status: "pending",
      },
      select: { id: true },
    });

    return { success: true, jobId: job.id };
  }
}
