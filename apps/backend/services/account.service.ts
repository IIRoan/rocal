import { createLogger } from "@workspace/logger";
import type { PrismaClient } from "../generated/prisma/index.js";
import type {
  DeleteAccountInput,
  DeleteAccountResult,
  IAccountService,
} from "../contracts/account.contract";
import { NotFoundError } from "../lib/errors";

const logger = createLogger("backend:account-service");

export class AccountService implements IAccountService {
  constructor(private readonly prisma: PrismaClient) {}

  async deleteAccount(
    input: DeleteAccountInput,
  ): Promise<DeleteAccountResult> {
    const existingUser = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true },
    });

    if (!existingUser) {
      throw new NotFoundError("User account not found");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.calendarSharing.deleteMany({
        where: {
          OR: [{ sharedWith: input.userId }, { sharedBy: input.userId }],
        },
      });

      await tx.notificationLog.deleteMany({
        where: { userId: input.userId },
      });

      await tx.user.delete({
        where: { id: input.userId },
      });
    });

    logger.warn("Deleted user account", { userId: input.userId });

    return {
      success: true,
      message: "Account deleted successfully",
      deletedUserId: input.userId,
    };
  }
}
