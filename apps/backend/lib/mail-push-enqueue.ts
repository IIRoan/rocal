import type { Prisma, PrismaClient } from "../generated/prisma/index.js";
import { mergeInboundMailPushItems, type InboundMailPushItem } from "./inbound-mail-push";
import {
  newMailPayload,
  NotificationJobPayloadError,
} from "./notification-job";
import { createLogger } from "@workspace/logger";
import { errorLogDetails, logRef } from "./log-sanitization";

const logger = createLogger("backend:mail-push-enqueue");

type PrismaLike = Pick<
  PrismaClient,
  "mailDirectoryEntry" | "userSettings" | "notificationJob"
>;

export type { InboundMailPushItem };

export type InboundMailPushInput = {
  accountId: string;
  userId?: string | null;
  items: InboundMailPushItem[];
};

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
  input: InboundMailPushInput,
): Promise<void> {
  const items = mergeInboundMailPushItems(input.items);
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
      accountRef: logRef(input.accountId),
      inboundCount: items.length,
    });
    return;
  }

  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { pushNotifications: true },
  });
  if (settings?.pushNotifications === false) {
    logger.info("Skipped mail push; app notifications are disabled", {
      userRef: logRef(userId),
      inboundCount: items.length,
    });
    return;
  }

  let enqueued = 0;
  let skippedDuplicate = 0;
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
        logger.warn("Rejected mail push payload", {
          emailRef: logRef(item.emailId),
          ...errorLogDetails(error),
        });
        continue;
      }
      throw error;
    }

    if (!payload.emailId) {
      logger.warn("Rejected mail push payload without emailId", {
        userRef: logRef(userId),
      });
      continue;
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
      skippedDuplicate += 1;
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
      if (isUniqueConstraintError(error)) {
        skippedDuplicate += 1;
        continue;
      }
      logger.warn("Failed to enqueue mail push", {
        userRef: logRef(userId),
        emailRef: logRef(item.emailId),
        ...errorLogDetails(error),
      });
    }
  }

  logger.info("Enqueued inbound mail push", {
    userRef: logRef(userId),
    inboundCount: items.length,
    enqueuedCount: enqueued,
    skippedDuplicateCount: skippedDuplicate,
    emailRefs: items.map((item) => logRef(item.emailId)),
  });
}
