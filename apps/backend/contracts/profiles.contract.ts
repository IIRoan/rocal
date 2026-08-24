import { z } from "zod";
import {
  SOLACE_PROFILE_LOOKUP_MAX_EMAILS,
  type SolaceProfileLookupResponse,
} from "@workspace/calendar-core";
import { strictZodObject } from "../lib/validation";

export const lookupProfilesBodySchema = strictZodObject({
  emails: z
    .array(z.string().trim().min(1).max(254))
    .max(SOLACE_PROFILE_LOOKUP_MAX_EMAILS),
});

export const profileAvatarQuerySchema = strictZodObject({
  email: z.string().trim().min(1).max(254),
});

export type LookupProfilesInput = z.infer<typeof lookupProfilesBodySchema>;

export interface IProfileService {
  lookup(emails: string[]): Promise<SolaceProfileLookupResponse>;
  streamAvatar(
    email: string,
  ): Promise<{ body: Uint8Array; contentType: string } | null>;
}
