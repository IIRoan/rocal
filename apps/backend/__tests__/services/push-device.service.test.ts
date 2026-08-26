import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { hashPushToken } from "../../lib/push-token";
import { PushDeviceService } from "../../services/push-device.service";

describe("PushDeviceService", () => {
  const token = "a".repeat(64);
  const tokenHash = hashPushToken(token);
  const upsert = jest.fn(async (_args: unknown) => ({ id: "dev-1" }));
  const findUnique = jest.fn(
    async (): Promise<{ id: string; userId: string } | null> => null,
  );
  const deleteOne = jest.fn(async () => ({ id: "dev-old" }));
  const deleteMany = jest.fn(async () => ({ count: 2 }));
  const findUniqueSettings = jest.fn(
    async (): Promise<{ pushNotifications: boolean } | null> => ({
      pushNotifications: true,
    }),
  );
  const countDevices = jest.fn(async () => 1);
  const createJob = jest.fn(async (_args: unknown) => ({ id: "job-test-1" }));

  const prisma = {
    pushDevice: {
      upsert,
      findUnique,
      delete: deleteOne,
      deleteMany,
      count: countDevices,
    },
    userSettings: {
      findUnique: findUniqueSettings,
    },
    notificationJob: {
      create: createJob,
    },
  };

  const service = new PushDeviceService(prisma as never);

  beforeEach(() => {
    upsert.mockClear();
    findUnique.mockClear();
    deleteOne.mockClear();
    deleteMany.mockClear();
    findUniqueSettings.mockClear();
    countDevices.mockClear();
    createJob.mockClear();
    findUnique.mockResolvedValue(null);
    findUniqueSettings.mockResolvedValue({ pushNotifications: true });
    countDevices.mockResolvedValue(1);
    createJob.mockResolvedValue({ id: "job-test-1" });
  });

  it("upserts a hashed token without logging the raw value", async () => {
    const result = await service.register({
      userId: "user-1",
      token,
      platform: "ios",
      bundleId: "onl.solace.mobile",
      environment: "production",
    });

    expect(result).toEqual({ success: true, deviceId: "dev-1" });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_tokenHash: { userId: "user-1", tokenHash },
        },
        create: expect.objectContaining({
          tokenHash,
          token,
          platform: "ios",
          environment: "production",
        }),
        update: expect.not.objectContaining({
          environment: expect.anything(),
        }),
      }),
    );
  });

  it("does not overwrite a learned APNs environment on token refresh", async () => {
    await service.register({
      userId: "user-1",
      token,
      platform: "ios",
      bundleId: "onl.solace.mobile.dev",
      environment: "sandbox",
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ environment: "sandbox" }),
        update: expect.not.objectContaining({
          environment: expect.anything(),
        }),
      }),
    );
  });

  it("reassigns a token that belonged to another user", async () => {
    findUnique.mockResolvedValueOnce({
      id: "other-device",
      userId: "user-2",
    });

    await service.register({
      userId: "user-1",
      token,
      platform: "ios",
      bundleId: "onl.solace.mobile.dev",
      environment: "sandbox",
    });

    expect(deleteOne).toHaveBeenCalledWith({
      where: { id: "other-device" },
    });
  });

  it("unregisters one token or all devices", async () => {
    deleteMany.mockResolvedValueOnce({ count: 1 });
    await expect(
      service.unregister({ userId: "user-1", token }),
    ).resolves.toEqual({ success: true, deletedCount: 1 });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", tokenHash },
    });

    deleteMany.mockResolvedValueOnce({ count: 3 });
    await expect(service.unregister({ userId: "user-1" })).resolves.toEqual({
      success: true,
      deletedCount: 3,
    });
  });

  it("enqueues a test push with a visible title", async () => {
    await expect(service.enqueueTest({ userId: "user-1" })).resolves.toEqual({
      success: true,
      jobId: "job-test-1",
    });
    expect(createJob).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        kind: "event_reminder",
        channel: "push",
        eventId: "test-notification",
        payload: {
          kind: "event_reminder",
          eventId: "test-notification",
          minutesBefore: 15,
          title: "Solace",
        },
      }),
      select: { id: true },
    });
  });

  it("rejects a test push when app notifications are off or no device exists", async () => {
    findUniqueSettings.mockResolvedValueOnce({ pushNotifications: false });
    await expect(service.enqueueTest({ userId: "user-1" })).rejects.toThrow(
      /App notifications are turned off/,
    );

    findUniqueSettings.mockResolvedValueOnce({ pushNotifications: true });
    countDevices.mockResolvedValueOnce(0);
    await expect(service.enqueueTest({ userId: "user-1" })).rejects.toThrow(
      /No iPhone is registered/,
    );
  });
});
