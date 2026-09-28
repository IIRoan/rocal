import { createLogger } from "@workspace/logger";
import type { Prisma, PrismaClient } from "../generated/prisma/index.js";
import { deleteAvatar } from "./avatar-storage";
import { errorLogDetails } from "./log-sanitization";

const logger = createLogger("backend:avatar-updates");
export const AVATAR_TRANSACTION_OPTIONS = { timeout: 30_000 };

export function lockAvatarUser(
  tx: Prisma.TransactionClient,
  where: Prisma.UserWhereUniqueInput,
) {
  // Every avatar mutation takes this row lock, including storage writes and cleanup.
  return tx.user.update({
    where,
    data: { updatedAt: new Date() },
    select: { id: true, avatarId: true, pendingAvatarId: true, image: true },
  });
}

type AvatarUser = Awaited<ReturnType<typeof lockAvatarUser>>;

export async function deletePendingAvatar(
  tx: Prisma.TransactionClient,
  user: AvatarUser,
): Promise<void> {
  if (!user.pendingAvatarId) return;
  await deleteAvatar(user.pendingAvatarId);
  await tx.user.update({
    where: { id: user.id },
    data: { pendingAvatarId: null },
  });
}

export async function cleanupPendingAvatar(
  prisma: PrismaClient,
  userId: string,
  expectedId: string | null,
): Promise<void> {
  if (!expectedId) return;
  try {
    await prisma.$transaction(async (tx) => {
      const user = await lockAvatarUser(tx, { id: userId });
      // A newer operation may already have consumed this slot.
      if (user.pendingAvatarId === expectedId)
        await deletePendingAvatar(tx, user);
    }, AVATAR_TRANSACTION_OPTIONS);
  } catch (error) {
    // Keep the durable slot for retry before the next change; never fail a committed replacement.
    logger.warn("Profile picture cleanup deferred", errorLogDetails(error));
  }
}

export async function deleteCurrentAvatar(
  tx: Prisma.TransactionClient,
  where: Prisma.UserWhereUniqueInput,
): Promise<void> {
  const user = await lockAvatarUser(tx, where);
  await deletePendingAvatar(tx, user);
  if (user.avatarId) await deleteAvatar(user.avatarId);
}

export async function updateUserImage(
  prisma: PrismaClient,
  args: Prisma.UserUpdateArgs,
) {
  const { result, userId, retiredId } = await prisma.$transaction(
    async (tx) => {
      const user = await lockAvatarUser(tx, args.where);
      const nextImage =
        typeof args.data.image === "object" && args.data.image !== null
          ? args.data.image.set
          : args.data.image;
      if (nextImage === user.image) {
        return {
          result: await tx.user.update(args),
          userId: user.id,
          retiredId: user.pendingAvatarId,
        };
      }
      await deletePendingAvatar(tx, user);
      const result = await tx.user.update({
        ...args,
        data: { ...args.data, avatarId: null, pendingAvatarId: user.avatarId },
      });
      return { result, userId: user.id, retiredId: user.avatarId };
    },
    AVATAR_TRANSACTION_OPTIONS,
  );
  await cleanupPendingAvatar(prisma, userId, retiredId);
  return result;
}

/** Older clients still change images through Better Auth's user update. */
export function withLegacyAvatarCleanup(prisma: PrismaClient) {
  return prisma.$extends({
    query: {
      user: {
        async update({ args, query }) {
          if (args.data.image === undefined) return query(args);
          return updateUserImage(prisma, args);
        },
      },
    },
  });
}
