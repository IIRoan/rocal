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
  const resolveIngestedJmapEmailId = jest.fn<
    (...args: unknown[]) => Promise<string>
  >().mockResolvedValue("gceaaabqr");
  const enqueue = enqueueInboundMailPush as jest.MockedFunction<
    typeof enqueueInboundMailPush
  >;

  beforeEach(() => {
    findUnique.mockReset();
    enqueue.mockClear();
    resolveIngestedJmapEmailId.mockClear();
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
        resolveIngestedJmapEmailId,
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
    expect(resolveIngestedJmapEmailId).toHaveBeenCalledWith("n", {
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
        resolveIngestedJmapEmailId,
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
