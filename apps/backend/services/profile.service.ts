import type { PrismaClient } from "../generated/prisma/index.js";
import {
  buildSolaceProfileAvatarPath,
  normalizeParticipantEmail,
  normalizeSolaceProfileLookupEmails,
  sanitizePublicImageUrl,
  type SolaceProfile,
  type SolaceProfileLookupResponse,
} from "@workspace/calendar-core";
import type { IProfileService } from "../contracts/profiles.contract";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_FETCH_TIMEOUT_MS = 8_000;

export class ProfileService implements IProfileService {
  constructor(private readonly prisma: PrismaClient) {}

  async lookup(emails: string[]): Promise<SolaceProfileLookupResponse> {
    const requested = normalizeSolaceProfileLookupEmails(emails);
    if (requested.length === 0) {
      return { profiles: [] };
    }

    const profiles: SolaceProfile[] = [];

    for (const email of requested) {
      const externalUrl = await this.resolveExternalImageUrl(email);
      if (!externalUrl) {
        continue;
      }

      const avatarPath = buildSolaceProfileAvatarPath(email);
      if (!avatarPath) {
        continue;
      }

      profiles.push({ email, image: avatarPath });
    }

    return { profiles };
  }

  async streamAvatar(
    email: string,
  ): Promise<{ body: Uint8Array; contentType: string } | null> {
    const externalUrl = await this.resolveExternalImageUrl(email);
    if (!externalUrl) {
      return null;
    }

    const response = await fetch(externalUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(AVATAR_FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "Solace/1.0" },
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      return null;
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_AVATAR_BYTES) {
      return null;
    }

    return {
      body: new Uint8Array(buffer),
      contentType,
    };
  }

  private async resolveExternalImageUrl(email: string): Promise<string | null> {
    const normalized = normalizeParticipantEmail(email);
    if (!normalized) {
      return null;
    }

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: normalized },
          { mailDirectoryEntry: { email: normalized } },
        ],
        image: { not: null },
      },
      select: {
        email: true,
        image: true,
        mailDirectoryEntry: {
          select: { email: true },
        },
      },
    });

    if (!user?.image) {
      return null;
    }

    return sanitizePublicImageUrl(user.image);
  }
}
