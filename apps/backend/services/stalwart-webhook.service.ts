import { createLogger } from "@workspace/logger";
import type {
  IStalwartWebhookService,
  StalwartWebhookHandleResult,
} from "../contracts/stalwart-webhook.contract";
import type { PrismaClient } from "../generated/prisma/index.js";
import {
  parseStalwartMailIngestEvents,
  type StalwartMailIngestEvent,
  type StalwartWebhookPayload,
} from "../lib/stalwart-webhook";
import {
  enqueueInboundMailPush,
  type InboundMailPushItem,
} from "../lib/mail-push-enqueue";
import type { MailSyncService } from "./mail-sync.service";
import { errorLogDetails, logRef } from "../lib/log-sanitization";

const logger = createLogger("backend:stalwart-webhook");

type WebhookPrisma = Pick<
  PrismaClient,
  "mailDirectoryEntry" | "userSettings" | "notificationJob"
>;

type ResolvedDirectoryEntry = {
  userId: string;
  stalwartAccountId: string;
  email: string;
};

export class StalwartWebhookService implements IStalwartWebhookService {
  constructor(
    private readonly input: {
      prisma: WebhookPrisma;
      mailSyncService?: Pick<
        MailSyncService,
        "resolveIngestedJmapEmailId"
      >;
    },
  ) {}

  async handlePayload(
    payload: StalwartWebhookPayload,
  ): Promise<StalwartWebhookHandleResult> {
    const ingestEvents = parseStalwartMailIngestEvents(payload);
    let enqueuedCount = 0;

    for (const event of ingestEvents) {
      const enqueued = await this.enqueueMailIngestEvent(event);
      if (enqueued) {
        enqueuedCount += 1;
      }
    }

    const ignoredCount = payload.events.length - ingestEvents.length;

    if (ingestEvents.length > 0) {
      logger.info("Processed Stalwart mail ingest webhook", {
        eventCount: ingestEvents.length,
        enqueuedCount,
        ignoredCount,
      });
    }

    return {
      processedCount: ingestEvents.length,
      enqueuedCount,
      ignoredCount,
    };
  }

  private async resolveDirectoryEntry(
    event: StalwartMailIngestEvent,
  ): Promise<ResolvedDirectoryEntry | null> {
    const byAccountId = await this.input.prisma.mailDirectoryEntry.findUnique({
      where: { stalwartAccountId: event.accountId },
      select: {
        userId: true,
        stalwartAccountId: true,
        email: true,
      },
    });
    if (byAccountId?.userId) {
      return {
        userId: byAccountId.userId,
        stalwartAccountId: byAccountId.stalwartAccountId,
        email: byAccountId.email,
      };
    }

    for (const recipientEmail of event.recipientEmails) {
      const byEmail = await this.input.prisma.mailDirectoryEntry.findUnique({
        where: { email: recipientEmail },
        select: {
          userId: true,
          stalwartAccountId: true,
          email: true,
        },
      });
      if (byEmail?.userId) {
        return {
          userId: byEmail.userId,
          stalwartAccountId: byEmail.stalwartAccountId,
          email: byEmail.email,
        };
      }
    }

    return null;
  }

  private async enqueueMailIngestEvent(
    event: StalwartMailIngestEvent,
  ): Promise<boolean> {
    const directoryEntry = await this.resolveDirectoryEntry(event);

    if (!directoryEntry) {
      logger.info("Skipped Stalwart mail ingest webhook for unlinked account", {
        accountRef: logRef(event.accountId),
        documentRef: logRef(event.documentId),
        recipientRefs: event.recipientEmails.map((email) => logRef(email)),
      });
      return false;
    }

    let jmapEmailId = event.documentId;
    if (this.input.mailSyncService) {
      try {
        const resolved = await this.input.mailSyncService.resolveIngestedJmapEmailId(
          directoryEntry.stalwartAccountId,
          {
            documentId: event.documentId,
            subject: event.subject,
            messageId: event.messageId,
            fromEmail: event.fromEmail,
          },
        );
        if (resolved) {
          jmapEmailId = resolved;
        }
      } catch (error) {
        logger.warn("Failed to resolve JMAP email id for Stalwart ingest webhook", {
          accountRef: logRef(directoryEntry.stalwartAccountId),
          documentRef: logRef(event.documentId),
          ...errorLogDetails(error),
        });
      }
    }

    const item: InboundMailPushItem = { emailId: jmapEmailId };

    await enqueueInboundMailPush(this.input.prisma, {
      accountId: directoryEntry.stalwartAccountId,
      userId: directoryEntry.userId,
      items: [item],
    });
    return true;
  }
}
