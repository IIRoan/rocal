import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../lib/mail-push-enqueue", () => ({
  enqueueInboundMailPush: jest.fn(async () => undefined),
}));

import { enqueueInboundMailPush } from "../../lib/mail-push-enqueue";
import { StalwartWebhookService } from "../../services/stalwart-webhook.service";

describe("StalwartWebhookService", () => {
  type DirectoryEntry = {
    userId: string;
    stalwartAccountId: string;
    email: string;
  };

  const findUnique = jest.fn<
    (args: { where: Record<string, string> }) => Promise<DirectoryEntry | null>
  >();
  const resolveIngestedEmail = jest.fn<
    (...args: unknown[]) => Promise<{ id: string; messageIds: string[] }>
  >();
  const enqueue = enqueueInboundMailPush as jest.MockedFunction<
    typeof enqueueInboundMailPush
  >;

  beforeEach(() => {
    findUnique.mockReset();
    enqueue.mockClear();
    resolveIngestedEmail.mockReset();
    resolveIngestedEmail.mockResolvedValue({
      id: "gceaaabqr",
      messageIds: ["<abc@example.com>"],
    });
  });

  it("resolves linked mailboxes by recipient email when telemetry accountId differs", async () => {
    findUnique.mockImplementation(async ({ where }: { where: Record<string, string> }) => {
      if (where.stalwartAccountId === "13") {
        return null;
      }
      if (where.email === "testingproduction15@solace.onl") {
        return {
          userId: "user-1",
          stalwartAccountId: "n",
          email: "testingproduction15@solace.onl",
        };
      }
      return null;
    });

    const service = new StalwartWebhookService({
      prisma: { mailDirectoryEntry: { findUnique } } as never,
      mailSyncService: {
        resolveIngestedEmail,
      },
    });

    const result = await service.handlePayload({
      events: [
        {
          type: "message-ingest.ham",
          data: {
            accountId: 13,
            documentId: 1553,
            to: ["testingproduction15@solace.onl"],
            subject: "54321",
            from: "Roan <vanwesteropbroan@gmail.com>",
          },
        },
      ],
    });

    expect(result).toEqual({
      processedCount: 1,
      enqueuedCount: 1,
      ignoredCount: 0,
    });
    expect(resolveIngestedEmail).toHaveBeenCalledWith("n", {
      documentId: "1553",
      subject: "54321",
      messageId: null,
      fromEmail: "vanwesteropbroan@gmail.com",
    });
    expect(enqueue).toHaveBeenCalledWith(expect.anything(), {
      accountId: "n",
      userId: "user-1",
      items: [
        { emailId: "gceaaabqr" },
      ],
    });
  });

  it("skips unlinked accounts without enqueueing push jobs", async () => {
    findUnique.mockResolvedValue(null);
    const service = new StalwartWebhookService({
      prisma: { mailDirectoryEntry: { findUnique } } as never,
      mailSyncService: {
        resolveIngestedEmail,
      },
    });

    const result = await service.handlePayload({
      events: [
        {
          type: "message-ingest.ham",
          data: {
            accountId: 99,
            documentId: 42,
            to: ["unknown@solace.onl"],
          },
        },
      ],
    });

    expect(result).toEqual({
      processedCount: 1,
      enqueuedCount: 0,
      ignoredCount: 0,
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("reports ignored non-ham events", async () => {
    const service = new StalwartWebhookService({
      prisma: { mailDirectoryEntry: { findUnique } } as never,
    });

    const result = await service.handlePayload({
      events: [
        { type: "message-ingest.spam", data: { accountId: "3", documentId: "1" } },
        { type: "telemetry.alert", data: {} },
      ],
    });

    expect(result).toEqual({
      processedCount: 0,
      enqueuedCount: 0,
      ignoredCount: 2,
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("skips the mail push for Solace reminder mail identified by the payload Message-ID", async () => {
    findUnique.mockResolvedValue({
      userId: "user-1",
      stalwartAccountId: "n",
      email: "owner@solace.onl",
    });
    const service = new StalwartWebhookService({
      prisma: { mailDirectoryEntry: { findUnique } } as never,
      mailSyncService: { resolveIngestedEmail },
    });

    const result = await service.handlePayload({
      events: [
        {
          type: "message-ingest.ham",
          data: {
            accountId: "n",
            documentId: "1600",
            to: ["owner@solace.onl"],
            from: "Reminder in 15 minutes <noreply@solace.onl>",
            messageId: "<solace-reminder.0f1e2d@solace.onl>",
          },
        },
      ],
    });

    expect(result.enqueuedCount).toBe(0);
    expect(resolveIngestedEmail).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("skips the mail push when the resolved email carries a Solace reminder Message-ID", async () => {
    findUnique.mockResolvedValue({
      userId: "user-1",
      stalwartAccountId: "n",
      email: "owner@solace.onl",
    });
    resolveIngestedEmail.mockResolvedValue({
      id: "gcyaaabqz",
      messageIds: ["solace-reminder.0f1e2d@solace.onl"],
    });
    const service = new StalwartWebhookService({
      prisma: { mailDirectoryEntry: { findUnique } } as never,
      mailSyncService: { resolveIngestedEmail },
    });

    const result = await service.handlePayload({
      events: [
        {
          type: "message-ingest.ham",
          data: {
            accountId: "n",
            documentId: "1601",
            to: ["owner@solace.onl"],
            from: "Reminder in 15 minutes <noreply@solace.onl>",
          },
        },
      ],
    });

    expect(result.enqueuedCount).toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("still pushes other mail from the noreply sender", async () => {
    findUnique.mockResolvedValue({
      userId: "user-1",
      stalwartAccountId: "n",
      email: "owner@solace.onl",
    });
    resolveIngestedEmail.mockResolvedValue({
      id: "gc2aaabq1",
      messageIds: ["<auth.123@solace.onl>"],
    });
    const service = new StalwartWebhookService({
      prisma: { mailDirectoryEntry: { findUnique } } as never,
      mailSyncService: { resolveIngestedEmail },
    });

    await service.handlePayload({
      events: [
        {
          type: "message-ingest.ham",
          data: {
            accountId: "n",
            documentId: "1602",
            to: ["owner@solace.onl"],
            from: "Solace <noreply@solace.onl>",
          },
        },
      ],
    });

    expect(enqueue).toHaveBeenCalledWith(expect.anything(), {
      accountId: "n",
      userId: "user-1",
      items: [{ emailId: "gc2aaabq1" }],
    });
  });

  describe("Solace reminder mail", () => {
    const ownerEntry = {
      userId: "user-1",
      stalwartAccountId: "n",
      email: "owner@solace.onl",
    };

    function ingest(data: Record<string, unknown>) {
      return {
        type: "message-ingest.ham",
        data: { accountId: "n", to: ["owner@solace.onl"], ...data },
      };
    }

    beforeEach(() => {
      findUnique.mockResolvedValue(ownerEntry);
    });

    it("pushes regular mail but not reminder mail in the same webhook batch", async () => {
      resolveIngestedEmail.mockImplementation(async (...args: unknown[]) => {
        const input = args[1] as { documentId: string };
        return { id: `jmap-${input.documentId}`, messageIds: [`<${input.documentId}@example.com>`] };
      });
      const service = new StalwartWebhookService({
        prisma: { mailDirectoryEntry: { findUnique } } as never,
        mailSyncService: { resolveIngestedEmail },
      });

      const result = await service.handlePayload({
        events: [
          ingest({ documentId: "1700", messageId: "<solace-reminder.aa@solace.onl>" }),
          ingest({ documentId: "1701", from: "Sam <sam@example.com>" }),
        ],
      });

      expect(result).toEqual({ processedCount: 2, enqueuedCount: 1, ignoredCount: 0 });
      expect(enqueue).toHaveBeenCalledTimes(1);
      expect(enqueue).toHaveBeenCalledWith(expect.anything(), {
        accountId: "n",
        userId: "user-1",
        items: [{ emailId: "jmap-1701" }],
      });
      expect(resolveIngestedEmail).toHaveBeenCalledTimes(1);
    });

    it("recognizes the reminder Message-ID under the message-id alias key", async () => {
      const service = new StalwartWebhookService({
        prisma: { mailDirectoryEntry: { findUnique } } as never,
        mailSyncService: { resolveIngestedEmail },
      });

      const result = await service.handlePayload({
        events: [ingest({ documentId: "1702", "message-id": "<solace-reminder.bb@solace.onl>" })],
      });

      expect(result.enqueuedCount).toBe(0);
      expect(resolveIngestedEmail).not.toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
    });

    it("skips when any of the resolved Message-IDs is a reminder", async () => {
      resolveIngestedEmail.mockResolvedValue({
        id: "gc3aaabq2",
        messageIds: ["<other@example.com>", "solace-reminder.cc@solace.onl"],
      });
      const service = new StalwartWebhookService({
        prisma: { mailDirectoryEntry: { findUnique } } as never,
        mailSyncService: { resolveIngestedEmail },
      });

      const result = await service.handlePayload({ events: [ingest({ documentId: "1703" })] });

      expect(result.enqueuedCount).toBe(0);
      expect(enqueue).not.toHaveBeenCalled();
    });

    it("still pushes when the JMAP lookup fails and the payload has no Message-ID", async () => {
      resolveIngestedEmail.mockRejectedValue(new Error("Stalwart unavailable"));
      const service = new StalwartWebhookService({
        prisma: { mailDirectoryEntry: { findUnique } } as never,
        mailSyncService: { resolveIngestedEmail },
      });

      const result = await service.handlePayload({ events: [ingest({ documentId: "1704" })] });

      expect(result.enqueuedCount).toBe(1);
      expect(enqueue).toHaveBeenCalledWith(expect.anything(), {
        accountId: "n",
        userId: "user-1",
        items: [{ emailId: "1704" }],
      });
    });

    it("still pushes when the JMAP lookup finds nothing", async () => {
      resolveIngestedEmail.mockResolvedValue(null as never);
      const service = new StalwartWebhookService({
        prisma: { mailDirectoryEntry: { findUnique } } as never,
        mailSyncService: { resolveIngestedEmail },
      });

      await service.handlePayload({ events: [ingest({ documentId: "1705" })] });

      expect(enqueue).toHaveBeenCalledWith(expect.anything(), {
        accountId: "n",
        userId: "user-1",
        items: [{ emailId: "1705" }],
      });
    });

    it("does not treat a Message-ID that only contains the prefix as a reminder", async () => {
      resolveIngestedEmail.mockResolvedValue({
        id: "gc4aaabq3",
        messageIds: ["<re.solace-reminder.dd@example.com>"],
      });
      const service = new StalwartWebhookService({
        prisma: { mailDirectoryEntry: { findUnique } } as never,
        mailSyncService: { resolveIngestedEmail },
      });

      const result = await service.handlePayload({
        events: [ingest({ documentId: "1706", messageId: "<re.solace-reminder.dd@example.com>" })],
      });

      expect(result.enqueuedCount).toBe(1);
      expect(enqueue).toHaveBeenCalledWith(expect.anything(), {
        accountId: "n",
        userId: "user-1",
        items: [{ emailId: "gc4aaabq3" }],
      });
    });
  });

  it("uses telemetry document ids when JMAP resolution is unavailable", async () => {
    findUnique.mockResolvedValue({
      userId: "user-1",
      stalwartAccountId: "n",
      email: "owner@solace.onl",
    });

    const service = new StalwartWebhookService({
      prisma: { mailDirectoryEntry: { findUnique } } as never,
    });

    await service.handlePayload({
      events: [
        {
          type: "message-ingest.ham",
          data: {
            accountId: "n",
            documentId: "1558",
            to: ["owner@solace.onl"],
            subject: "Hello",
          },
        },
      ],
    });

    expect(enqueue).toHaveBeenCalledWith(expect.anything(), {
      accountId: "n",
      userId: "user-1",
      items: [
        { emailId: "1558" },
      ],
    });
  });
});
