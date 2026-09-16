import type { PrismaClient } from "../generated/prisma/index.js";
import {
  buildSolaceProfileAvatarPath,
  isReservedSystemEmail,
  normalizeParticipantEmail,
  normalizeSolaceProfileLookupEmails,
  sanitizePublicImageUrl,
  type SolaceProfile,
  type SolaceProfileLookupResponse,
} from "@workspace/calendar-core";
import type { IProfileService } from "../contracts/profiles.contract";
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
    if (isReservedSystemEmail(email)) {
      return null;
    }

    const externalUrl = await this.resolveExternalImageUrl(email);
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

  private async resolveExternalImageUrl(email: string): Promise<string | null> {
    const normalized = normalizeParticipantEmail(email);
    if (!normalized || isReservedSystemEmail(normalized)) {
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
