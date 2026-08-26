import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { enqueueInboundMailPush } from "../../lib/mail-push-enqueue";

describe("enqueueInboundMailPush", () => {
  const findUniqueDirectory = jest.fn(async () => ({ userId: "user-1" }));
  const findUniqueSettings = jest.fn(async () => ({ pushNotifications: true }));
  const findFirstJob = jest.fn(
    async (): Promise<{ id: string } | null> => null,
  );
  const createJob = jest.fn(
    async (_args: { data: { payload: Record<string, unknown> } }) => ({
      id: "job-1",
    }),
  );

  const prisma = {
    mailDirectoryEntry: { findUnique: findUniqueDirectory },
    userSettings: { findUnique: findUniqueSettings },
    notificationJob: {
      findFirst: findFirstJob,
      create: createJob,
    },
  };

  beforeEach(() => {
    findUniqueDirectory.mockClear();
    findUniqueSettings.mockClear();
    findFirstJob.mockClear();
    createJob.mockClear();
    findUniqueSettings.mockResolvedValue({ pushNotifications: true });
    findFirstJob.mockResolvedValue(null);
  });

  it("enqueues a new_mail push job with the inbound subject", async () => {
    await enqueueInboundMailPush(prisma as never, {
      accountId: "acct-1",
      items: [
        {
          emailId: "in-1",
          subject: "Lunch tomorrow",
          fromName: "Sam",
        },
      ],
    });

    expect(createJob).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        kind: "new_mail",
        channel: "push",
        payload: {
          kind: "new_mail",
          inboundCount: 1,
          subject: "Lunch tomorrow",
          fromName: "Sam",
          emailId: "in-1",
        },
      }),
    });
  });

  it("enqueues a separate pending job for each inbound message", async () => {
    await enqueueInboundMailPush(prisma as never, {
      accountId: "acct-1",
      userId: "user-1",
      items: [
        {
          emailId: "in-1",
          subject: "First",
          fromName: "Sam",
        },
        {
          emailId: "in-2",
          subject: "Second",
          fromName: "Sam",
        },
      ],
    });

    expect(createJob).toHaveBeenCalledTimes(2);
  });

  it("skips when push notifications are disabled", async () => {
    findUniqueSettings.mockResolvedValueOnce({ pushNotifications: false });
    await enqueueInboundMailPush(prisma as never, {
      accountId: "acct-1",
      userId: "user-1",
      items: [{ emailId: "in-1", subject: "Hello", fromName: null }],
    });
    expect(createJob).not.toHaveBeenCalled();
  });

  it("skips when there are no inbound items", async () => {
    await enqueueInboundMailPush(prisma as never, {
      accountId: "acct-1",
      userId: "user-1",
      items: [],
    });
    expect(createJob).not.toHaveBeenCalled();
    expect(findUniqueDirectory).not.toHaveBeenCalled();
  });

  it("skips when the account is not linked to a user", async () => {
    findUniqueDirectory.mockResolvedValueOnce(null as never);
    await enqueueInboundMailPush(prisma as never, {
      accountId: "acct-1",
      items: [{ emailId: "in-1", subject: "Hello", fromName: null }],
    });
    expect(createJob).not.toHaveBeenCalled();
  });

  it("does not enqueue a second job after one was already stored for that email", async () => {
    findFirstJob.mockResolvedValueOnce({ id: "job-existing" });
    await enqueueInboundMailPush(prisma as never, {
      accountId: "acct-1",
      userId: "user-1",
      items: [{ emailId: "in-1", subject: "Lunch tomorrow", fromName: "Sam" }],
    });
    expect(createJob).not.toHaveBeenCalled();
  });

  it("rejects invalid notification payloads", async () => {
    await enqueueInboundMailPush(prisma as never, {
      accountId: "acct-1",
      userId: "user-1",
      items: [{ emailId: "", subject: "Hello", fromName: "Sam" }],
    });
    expect(createJob).not.toHaveBeenCalled();
  });

  it("treats unique-constraint races as duplicate skips", async () => {
    createJob.mockRejectedValueOnce({ code: "P2002" });
    await enqueueInboundMailPush(prisma as never, {
      accountId: "acct-1",
      userId: "user-1",
      items: [{ emailId: "in-1", subject: "Hello", fromName: "Sam" }],
    });
    expect(createJob).toHaveBeenCalledTimes(1);
  });
});
