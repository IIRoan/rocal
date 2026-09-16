import { createLogger } from "@workspace/logger";
import type { PrismaClient } from "../generated/prisma/index.js";
import type {
  AccountSignupConfig,
  CheckEmailAvailabilityInput,
  CheckEmailAvailabilityResult,
  DeleteAccountInput,
  DeleteAccountResult,
  IAccountService,
} from "../contracts/account.contract";
import type { IMailService } from "../contracts/mail.contract";
import { NotFoundError } from "../lib/errors";
import { normalizeDesiredSolaceEmailInput } from "../lib/solace-email";

const logger = createLogger("backend:account-service");

export class AccountService implements IAccountService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: AccountSignupConfig = {
      defaultEmailDomain: "solace.onl",
    },
    private readonly mailService?: Pick<IMailService, "deleteMailboxForUser">,
  ) {}

  getSignupConfig(): AccountSignupConfig {
    return {
      defaultEmailDomain: this.config.defaultEmailDomain,
    };
  }

  async checkEmailAvailability(
    input: CheckEmailAvailabilityInput,
  ): Promise<CheckEmailAvailabilityResult> {
    const desiredEmail = normalizeDesiredSolaceEmailInput(
      input.email,
      this.config.defaultEmailDomain,
    );

    if (!desiredEmail.success) {
      const isReserved = desiredEmail.error.message.includes("reserved");
      return {
        email: input.email,
        localPart: desiredEmail.error.localPart,
        domain: desiredEmail.error.domain,
        normalizedEmail: desiredEmail.error.normalizedEmail,
        available: false,
        code: isReserved ? "reserved" : "invalid_email",
        message: desiredEmail.error.message,
      };
    }

    const { localPart, normalizedEmail, domain } = desiredEmail.value;

    const [existingUser, existingMailbox] = await Promise.all([
      this.prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      }),
      this.prisma.mailDirectoryEntry.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      }),
    ]);

    if (existingUser || existingMailbox) {
      return {
        email: input.email,
        localPart,
        domain,
        normalizedEmail,
        available: false,
        code: "already_in_use",
        message: "That email address is already in use.",
      };
    }

    return {
      email: input.email,
      localPart,
      domain,
      normalizedEmail,
      available: true,
      code: "available",
      message: "That email address is available.",
    };
  }

  async deleteAccount(input: DeleteAccountInput): Promise<DeleteAccountResult> {
    const existingUser = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        email: true,
        mailDirectoryEntry: { select: { email: true } },
      },
    });

    if (!existingUser) {
      throw new NotFoundError("User account not found");
    }

    // Read before the mailbox (and its directory entry) is removed.
    const userEmails = [
      ...new Set(
        [existingUser.email, existingUser.mailDirectoryEntry?.email]
          .filter((email): email is string => Boolean(email))
          .map((email) => email.trim().toLowerCase()),
      ),
    ];

    if (this.mailService) {
      await this.mailService.deleteMailboxForUser({ userId: input.userId });
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

      // Invites addressed to or claimed for the user belong to another inviter, so they do not cascade.
      if (userEmails.length > 0) {
        await tx.invite.deleteMany({
          where: {
            OR: [
              { email: { in: userEmails } },
              { claimedForEmail: { in: userEmails } },
            ],
          },
        });
      }

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
