import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { enqueueInboundMailPush } from "../../lib/mail-push-enqueue";
import type { MailSyncResult } from "../../services/mail-sync.service";

function syncWithInbound(subject?: string, fromName?: string): MailSyncResult {
  return {
    accountId: "acct-1",
    initialized: false,
    changedTypes: ["Email"],
    email: {
      oldState: null,
      newState: "s1",
      created: ["in-1"],
      updated: [],
      destroyed: [],
      records: [
        {
          id: "in-1",
          mailboxIds: { "mb-inbox": true },
          ...(subject ? { subject } : {}),
          ...(fromName ? { from: [{ email: "a@example.com", name: fromName }] } : {}),
        },
      ],
    },
    mailbox: {
      oldState: null,
      newState: "s1",
      created: [],
      updated: [],
      destroyed: [],
      records: [{ id: "mb-inbox", name: "Inbox", role: "inbox" }],
    },
    thread: {
      oldState: null,
      newState: "s1",
      created: [],
      updated: [],
      destroyed: [],
      records: [],
    },
    calendarImport: {
      messagesScanned: 0,
      icsPartsFound: 0,
      eventsCreated: 0,
      eventsUpdated: 0,
      eventsDeleted: 0,
      errors: [],
    },
  };
}

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
      sync: syncWithInbound("Lunch tomorrow", "Sam"),
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
    const payload = createJob.mock.calls[0]?.[0]?.data.payload as Record<
      string,
      unknown
    >;
    expect(payload).not.toHaveProperty("from");
    expect(payload).not.toHaveProperty("title");
  });

  it("enqueues a separate pending job for each inbound message", async () => {
    await enqueueInboundMailPush(prisma as never, {
      accountId: "acct-1",
      userId: "user-1",
      sync: {
        ...syncWithInbound("First"),
        email: {
          oldState: null,
          newState: "s1",
          created: ["in-1", "in-2"],
          updated: [],
          destroyed: [],
          records: [
            {
              id: "in-1",
              mailboxIds: { "mb-inbox": true },
              subject: "First",
              from: [{ email: "a@example.com", name: "Sam" }],
            },
            {
              id: "in-2",
              mailboxIds: { "mb-inbox": true },
              subject: "Second",
              from: [{ email: "a@example.com", name: "Sam" }],
            },
          ],
        },
      },
    });

    expect(createJob).toHaveBeenCalledTimes(2);
    expect(createJob).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        payload: expect.objectContaining({
          emailId: "in-1",
          subject: "First",
        }),
      }),
    });
    expect(createJob).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        payload: expect.objectContaining({
          emailId: "in-2",
          subject: "Second",
        }),
      }),
    });
  });

  it("skips when push notifications are disabled", async () => {
    findUniqueSettings.mockResolvedValueOnce({ pushNotifications: false });
    await enqueueInboundMailPush(prisma as never, {
      accountId: "acct-1",
      userId: "user-1",
      sync: syncWithInbound(),
    });
    expect(createJob).not.toHaveBeenCalled();
  });

  it("skips when there is no inbound created mail", async () => {
    await enqueueInboundMailPush(prisma as never, {
      accountId: "acct-1",
      userId: "user-1",
      sync: {
        ...syncWithInbound(),
        email: {
          oldState: null,
          newState: "s1",
          created: [],
          updated: [],
          destroyed: [],
          records: [],
        },
      },
    });
    expect(createJob).not.toHaveBeenCalled();
    expect(findUniqueDirectory).not.toHaveBeenCalled();
  });

  it("skips when the account is not linked to a user", async () => {
    findUniqueDirectory.mockResolvedValueOnce(null as never);
    await enqueueInboundMailPush(prisma as never, {
      accountId: "acct-1",
      sync: syncWithInbound(),
    });
    expect(createJob).not.toHaveBeenCalled();
  });

  it("ignores a duplicate pending job for the same inbound email", async () => {
    createJob.mockRejectedValueOnce(
      Object.assign(new Error("unique"), { code: "P2002" }),
    );
    await expect(
      enqueueInboundMailPush(prisma as never, {
        accountId: "acct-1",
        userId: "user-1",
        sync: syncWithInbound("Lunch tomorrow", "Sam"),
      }),
    ).resolves.toBeUndefined();
    expect(createJob).toHaveBeenCalledTimes(1);
  });

  it("does not enqueue a second job after one was already stored for that email", async () => {
    findFirstJob.mockResolvedValueOnce({ id: "job-existing" });
    await enqueueInboundMailPush(prisma as never, {
      accountId: "acct-1",
      userId: "user-1",
      sync: syncWithInbound("Lunch tomorrow", "Sam"),
    });
    expect(createJob).not.toHaveBeenCalled();
  });
});
