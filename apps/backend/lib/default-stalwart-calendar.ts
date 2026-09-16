import { defaultMailService } from "./default-mail-service";
import { env } from "./env";
import { prisma } from "./prisma";
import {
  createStalwartCalendarClient,
  type StalwartCalendarClientLike,
} from "./stalwart-calendar";

async function resolveCalendarAccountOwner(accountId: string) {
  const entry = await prisma.mailDirectoryEntry.findUnique({
    where: { stalwartAccountId: accountId },
    select: { userId: true, email: true },
  });

  if (!entry?.userId) {
    throw new Error("That mail account is not linked to a Solace account.");
  }

  return { userId: entry.userId, email: entry.email };
}

/** Null without a bridge secret: no owner token can be minted, so skip mirroring. */
export function getDefaultStalwartCalendarClient(): StalwartCalendarClientLike | null {
  if (!env.mailBridgeHmacKey.trim()) {
    return null;
  }

  return createStalwartCalendarClient({
    tokens: defaultMailService,
    resolveOwner: resolveCalendarAccountOwner,
  });
}
