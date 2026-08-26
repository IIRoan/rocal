import type { Prisma, PrismaClient } from "../generated/prisma/index.js";
import { listInboundCreatedEmails } from "./inbound-mail-push";
import {
  newMailPayload,
  NotificationJobPayloadError,
} from "./notification-job";
import type { MailSyncResult } from "../services/mail-sync.service";
import { createLogger } from "@workspace/logger";
import { errorLogDetails, logRef } from "./log-sanitization";

const logger = createLogger("backend:mail-push-enqueue");

type PrismaLike = Pick<
  PrismaClient,
  "mailDirectoryEntry" | "userSettings" | "notificationJob"
>;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export async function enqueueInboundMailPush(
  prisma: PrismaLike,
  input: {
    accountId: string;
    userId?: string | null;
    sync: MailSyncResult;
  },
): Promise<void> {
  const items = listInboundCreatedEmails(input.sync);
  if (items.length === 0) {
    return;
  }

  const userId =
    input.userId ??
    (
      await prisma.mailDirectoryEntry.findUnique({
        where: { stalwartAccountId: input.accountId },
        select: { userId: true },
      })
    )?.userId;

  if (!userId) {
    logger.warn("Skipped mail push; mailbox is not linked to a user", {
      accountId: input.accountId,
      inboundCount: items.length,
    });
    return;
  }

  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { pushNotifications: true },
  });
  if (settings?.pushNotifications === false) {
    return;
  }

  let enqueued = 0;
  for (const item of items) {
    let payload;
    try {
      payload = newMailPayload(1, {
        subject: item.subject,
        fromName: item.fromName,
        emailId: item.emailId,
      });
    } catch (error) {
      if (error instanceof NotificationJobPayloadError) {
        logger.warn("Rejected mail push payload", errorLogDetails(error));
        continue;
      }
      throw error;
    }

    const existing = await prisma.notificationJob.findFirst({
      where: {
        userId,
        kind: "new_mail",
        channel: "push",
        payload: {
          path: ["emailId"],
          equals: item.emailId,
        },
      },
      select: { id: true },
    });
    if (existing) {
      continue;
    }

    try {
      await prisma.notificationJob.create({
        data: {
          userId,
          kind: "new_mail",
          channel: "push",
          payload: payload as Prisma.InputJsonValue,
          status: "pending",
        },
      });
      enqueued += 1;
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        logger.warn("Failed to enqueue mail push", {
          userRef: logRef(userId),
          ...errorLogDetails(error),
        });
      }
    }
  }

  if (enqueued > 0) {
    logger.info("Enqueued inbound mail push", {
      userRef: logRef(userId),
      inboundCount: items.length,
      enqueuedCount: enqueued,
    });
  }
}
