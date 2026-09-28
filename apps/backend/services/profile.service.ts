import { randomBytes } from "node:crypto";
import type { PrismaClient } from "../generated/prisma/index.js";
import {
  buildSolaceProfileAvatarPath,
  buildSolaceUploadedAvatarPath,
  isReservedSystemEmail,
  normalizeParticipantEmail,
  normalizeSolaceProfileLookupEmails,
  sanitizePublicImageUrl,
  solaceAvatarVariantSize,
  SOLACE_AVATAR_UPLOAD_SIZE_PX,
  type ProfileAvatarResponse,
  type SolaceProfile,
  type SolaceProfileLookupResponse,
} from "@workspace/calendar-core";
import type {
  IProfileService,
  ProfileAvatarImage,
} from "../contracts/profiles.contract";
import { readAvatar, storeAvatar } from "../lib/avatar-storage";
import { ConflictError } from "../lib/errors";
import {
  AVATAR_TRANSACTION_OPTIONS,
  cleanupPendingAvatar,
  deletePendingAvatar,
  lockAvatarUser,
  updateUserImage,
} from "../lib/avatar-updates";
import { SafeFetchError, safeFetch } from "../lib/safe-fetch";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_FETCH_TIMEOUT_MS = 8_000;
const MAX_AVATAR_REDIRECTS = 3;

export class ProfileService implements IProfileService {
  constructor(private readonly prisma: PrismaClient) {}

  async lookup(emails: string[]): Promise<SolaceProfileLookupResponse> {
    const requested = normalizeSolaceProfileLookupEmails(emails);
    if (requested.length === 0) {
      return { profiles: [] };
    }

    const profiles: SolaceProfile[] = [];

    for (const email of requested) {
      if (isReservedSystemEmail(email)) {
        continue;
      }

      const user = await this.findAvatarOwner(email);
      const avatarPath = user?.avatarId
        ? buildSolaceUploadedAvatarPath(user.avatarId)
        : sanitizePublicImageUrl(user?.image) &&
          buildSolaceProfileAvatarPath(email);
      if (!avatarPath) {
        continue;
      }

      profiles.push({ email, image: avatarPath });
    }

    return { profiles };
  }

  async streamAvatar(
    email: string,
    size?: number,
  ): Promise<ProfileAvatarImage | null> {
    if (isReservedSystemEmail(email)) {
      return null;
    }

    const user = await this.findAvatarOwner(email);
    if (user?.avatarId) {
      return this.readUploadedAvatar(user.avatarId, size);
    }

    const externalUrl = sanitizePublicImageUrl(user?.image);
    if (!externalUrl) {
      return null;
    }

    let response: Response;
    try {
      response = await safeFetch(externalUrl, {
        headers: { "User-Agent": "Solace/1.0", Accept: "image/*" },
        timeoutMs: AVATAR_FETCH_TIMEOUT_MS,
        maxBytes: MAX_AVATAR_BYTES,
        maxRedirects: MAX_AVATAR_REDIRECTS,
      });
    } catch (error) {
      if (error instanceof SafeFetchError) {
        return null;
      }
      throw error;
    }

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      return null;
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) {
      return null;
    }

    return {
      body: new Uint8Array(buffer),
      contentType,
    };
  }

  async streamUploadedAvatar(
    avatarId: string,
    size?: number,
  ): Promise<ProfileAvatarImage | null> {
    // Only ids still attached to an account resolve, so replaced pictures stop serving even if an object lingers.
    const owner = await this.prisma.user.findUnique({
      where: { avatarId },
      select: { id: true },
    });
    return owner ? this.readUploadedAvatar(avatarId, size) : null;
  }

  async uploadAvatar(input: {
    userId: string;
    image: string;
  }): Promise<ProfileAvatarResponse> {
    const avatarId = randomBytes(16).toString("base64url");
    const image = buildSolaceUploadedAvatarPath(avatarId);

    // Commit the reservation before bucket writes so even interrupted uploads stay discoverable.
    await this.prisma.$transaction(async (tx) => {
      const user = await lockAvatarUser(tx, { id: input.userId });
      await deletePendingAvatar(tx, user);
      await tx.user.update({
        where: { id: input.userId },
        data: { pendingAvatarId: avatarId },
      });
    }, AVATAR_TRANSACTION_OPTIONS);

    let retiredId: string | null;
    try {
      retiredId = await this.prisma.$transaction(async (tx) => {
        const user = await lockAvatarUser(tx, { id: input.userId });
        if (user.pendingAvatarId !== avatarId) {
          throw new ConflictError("Profile picture changed. Please try again.");
        }
        await storeAvatar(avatarId, Buffer.from(input.image, "base64"));
        await tx.user.update({
          where: { id: input.userId },
          data: { avatarId, image, pendingAvatarId: user.avatarId },
        });
        return user.avatarId;
      }, AVATAR_TRANSACTION_OPTIONS);
    } catch (error) {
      await cleanupPendingAvatar(this.prisma, input.userId, avatarId);
      throw error;
    }
    await cleanupPendingAvatar(this.prisma, input.userId, retiredId);
    return { image };
  }

  async removeAvatar(input: {
    userId: string;
  }): Promise<ProfileAvatarResponse> {
    await updateUserImage(this.prisma, {
      where: { id: input.userId },
      data: { image: null },
    });
    return { image: null };
  }

  private async readUploadedAvatar(
    avatarId: string,
    size = SOLACE_AVATAR_UPLOAD_SIZE_PX,
  ): Promise<ProfileAvatarImage | null> {
    const body = await readAvatar(avatarId, solaceAvatarVariantSize(size));
    return body ? { body, contentType: "image/webp" } : null;
  }

  private findAvatarOwner(email: string) {
    const normalized = normalizeParticipantEmail(email);
    if (!normalized || isReservedSystemEmail(normalized)) {
      return null;
    }

    return this.prisma.user.findFirst({
      where: {
        AND: [
          {
            OR: [
              { email: normalized },
              { mailDirectoryEntry: { email: normalized } },
            ],
          },
          { OR: [{ avatarId: { not: null } }, { image: { not: null } }] },
        ],
      },
      select: { avatarId: true, image: true },
    });
  }
}
