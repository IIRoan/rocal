import { z } from "zod";
import {
  SOLACE_AVATAR_ID_PATTERN,
  SOLACE_AVATAR_UPLOAD_MAX_BYTES,
  SOLACE_PROFILE_LOOKUP_MAX_EMAILS,
  type ProfileAvatarResponse,
  type SolaceProfileLookupResponse,
} from "@workspace/calendar-core";
import { strictZodObject } from "../lib/validation";
import { optionalQueryInt } from "./_zod";

const MAX_AVATAR_BASE64_LENGTH = Math.ceil(SOLACE_AVATAR_UPLOAD_MAX_BYTES / 3) * 4;

export const lookupProfilesBodySchema = strictZodObject({
  emails: z
    .array(z.string().trim().min(1).max(254))
    .max(SOLACE_PROFILE_LOOKUP_MAX_EMAILS),
});

/** Requested display size in physical pixels; the API rounds up to a stored variant. */
const avatarSizeQuery = optionalQueryInt({ min: 1, max: 4096 });

export const profileAvatarQuerySchema = strictZodObject({
  email: z.string().trim().min(1).max(254),
  size: avatarSizeQuery,
});

export const profileAvatarSizeQuerySchema = strictZodObject({
  size: avatarSizeQuery,
});

export const uploadProfileAvatarBodySchema = strictZodObject({
  image: z.string().min(1).max(MAX_AVATAR_BASE64_LENGTH),
});

export const profileAvatarIdParamsSchema = strictZodObject({
  avatarId: z.string().regex(SOLACE_AVATAR_ID_PATTERN),
});

export type LookupProfilesInput = z.infer<typeof lookupProfilesBodySchema>;

export interface ProfileAvatarImage {
  body: Uint8Array;
  contentType: string;
}

export interface IProfileService {
  lookup(emails: string[]): Promise<SolaceProfileLookupResponse>;
  streamAvatar(
    email: string,
    size?: number,
  ): Promise<ProfileAvatarImage | null>;
  streamUploadedAvatar(
    avatarId: string,
    size?: number,
  ): Promise<ProfileAvatarImage | null>;
  uploadAvatar(input: {
    userId: string;
    image: string;
  }): Promise<ProfileAvatarResponse>;
  removeAvatar(input: { userId: string }): Promise<ProfileAvatarResponse>;
}
