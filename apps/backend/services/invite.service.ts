import { createLogger } from "@workspace/logger";
import type { PrismaClient } from "../generated/prisma/index.js";
import type {
  IInviteService,
  CreateInviteInput,
  CreateInviteResult,
  ListInvitesInput,
  ListInvitesResult,
  RevokeInviteInput,
  RevokeInviteResult,
  ValidateInviteTokenInput,
  ValidateInviteTokenResult,
  ClaimInviteInput,
  ClaimInviteResult,
  InviteRecord,
} from "../contracts/invite.contract";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../lib/errors";
import { normalizeEmail } from "../lib/email-utils";

const logger = createLogger("backend:invite-service");

const INVITE_EXPIRY_DAYS = 7;
const CLAIM_WINDOW_MINUTES = 15;

function isInviteExpired(invite: { expiresAt: Date }): boolean {
  return new Date() > invite.expiresAt;
}

function getInviteUnavailableReason(invite: {
  status: string;
  expiresAt: Date;
}): string | null {
  if (invite.status === "revoked") {
    return "This invite has been revoked.";
  }

  if (invite.status === "accepted") {
    return "This invite has already been used.";
  }

  if (invite.status === "claimed") {
    return "This invite has already been claimed.";
  }

  if (isInviteExpired(invite)) {
    return "This invite has expired.";
  }

  return null;
}

function toInviteRecord(invite: {
  id: string;
  token: string;
  email: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  invitedById: string;
}): InviteRecord {
  return {
    id: invite.id,
    token: invite.token,
    email: invite.email,
    status: invite.status as InviteRecord["status"],
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
    invitedById: invite.invitedById,
  };
}

export class InviteService implements IInviteService {
  constructor(private readonly prisma: PrismaClient) {}

  private async ensureInviteTargetIsAvailable(
    invitedById: string,
    email: string,
  ): Promise<void> {
    const [existingUser, existingInvite] = await Promise.all([
      this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      }),
      this.prisma.invite.findFirst({
        where: {
          invitedById,
          email,
          status: { in: ["pending", "claimed"] },
        },
        select: { id: true },
      }),
    ]);

    if (existingUser) {
      throw new ConflictError("That email address already has an account.");
    }

    if (existingInvite) {
      throw new ConflictError(
        "You already have an active invite for that email address.",
      );
    }
  }

  private async findInviteByToken(token: string) {
    return this.prisma.invite.findUnique({
      where: { token },
      include: {
        invitedBy: { select: { name: true } },
      },
    });
  }

  private async findClaimedInviteForEmail(normalizedEmail: string) {
    const claimWindowStart = new Date(
      Date.now() - CLAIM_WINDOW_MINUTES * 60 * 1000,
    );

    return this.prisma.invite.findFirst({
      where: {
        claimedForEmail: normalizedEmail,
        status: "claimed",
        claimedAt: { gte: claimWindowStart },
      },
    });
  }

  async createInvite(input: CreateInviteInput): Promise<CreateInviteResult> {
    const email = normalizeEmail(input.email);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ValidationError("Please provide a valid email address.");
    }

    await this.ensureInviteTargetIsAvailable(input.invitedById, email);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

    const invite = await this.prisma.invite.create({
      data: {
        invitedById: input.invitedById,
        email,
        expiresAt,
        status: "pending",
      },
    });

    logger.info("Invite created", {
      inviteId: invite.id,
      invitedById: input.invitedById,
    });

    return toInviteRecord(invite);
  }

  async listInvites(input: ListInvitesInput): Promise<ListInvitesResult> {
    const invites = await this.prisma.invite.findMany({
      where: { invitedById: input.invitedById },
      orderBy: { createdAt: "desc" },
    });

    return { invites: invites.map(toInviteRecord) };
  }

  async revokeInvite(input: RevokeInviteInput): Promise<RevokeInviteResult> {
    const invite = await this.prisma.invite.findUnique({
      where: { id: input.id },
      select: { id: true, invitedById: true, status: true },
    });

    if (!invite) {
      throw new NotFoundError("Invite not found.");
    }

    if (invite.invitedById !== input.invitedById) {
      throw new ForbiddenError("You can only revoke your own invites.");
    }

    if (invite.status === "accepted") {
      throw new ValidationError(
        "Cannot revoke an invite that has already been accepted.",
      );
    }

    if (invite.status === "revoked") {
      return { success: true };
    }

    await this.prisma.invite.update({
      where: { id: input.id },
      data: { status: "revoked" },
    });

    logger.info("Invite revoked", {
      inviteId: input.id,
      by: input.invitedById,
    });

    return { success: true };
  }

  async validateInviteToken(
    input: ValidateInviteTokenInput,
  ): Promise<ValidateInviteTokenResult> {
    const invite = await this.findInviteByToken(input.token);

    if (!invite) {
      return {
        valid: false,
        reason: "Invite not found. Please check the token and try again.",
      };
    }

    const unavailableReason = getInviteUnavailableReason(invite);
    if (unavailableReason) {
      return { valid: false, reason: unavailableReason };
    }

    return {
      valid: true,
      inviteId: invite.id,
      email: invite.email,
      inviterName: invite.invitedBy.name || "Someone",
    };
  }

  async claimInviteToken(input: ClaimInviteInput): Promise<ClaimInviteResult> {
    const invite = await this.prisma.invite.findUnique({
      where: { token: input.token },
    });

    if (!invite) {
      return { success: false, reason: "Invite not found." };
    }

    const unavailableReason = getInviteUnavailableReason(invite);
    if (unavailableReason) {
      return { success: false, reason: unavailableReason };
    }

    const chosenEmail = normalizeEmail(input.chosenEmail);
    if (!chosenEmail) {
      return { success: false, reason: "A Solace email is required." };
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: chosenEmail },
      select: { id: true },
    });
    if (existingUser) {
      return {
        success: false,
        reason: "That email address already has an account.",
      };
    }

    const result = await this.prisma.invite.updateMany({
      where: { id: invite.id, status: "pending" },
      data: {
        status: "claimed",
        claimedForEmail: chosenEmail,
        claimedAt: new Date(),
      },
    });

    if (result.count === 0) {
      return {
        success: false,
        reason: "This invite is no longer available.",
      };
    }

    logger.info("Invite claimed", { inviteId: invite.id, chosenEmail });

    return { success: true, inviteId: invite.id };
  }

  async checkSignupAllowed(
    email: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const normalizedEmail = normalizeEmail(email);
    const invite = await this.findClaimedInviteForEmail(normalizedEmail);

    if (!invite) {
      return {
        allowed: false,
        reason:
          "An invite is required to create an account. Please use your invite token before signing up.",
      };
    }

    return { allowed: true };
  }

  async markInviteAccepted(email: string): Promise<void> {
    const normalizedEmail = normalizeEmail(email);
    const invite = await this.findClaimedInviteForEmail(normalizedEmail);

    if (invite) {
      await this.prisma.invite.update({
        where: { id: invite.id },
        data: { status: "accepted" },
      });
      logger.info("Invite marked accepted", {
        inviteId: invite.id,
        email: normalizedEmail,
      });
    }
  }
}
