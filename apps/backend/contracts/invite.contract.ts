import { z } from "zod";
import { strictZodObject } from "../lib/validation";
import { resourceIdParamsSchema } from "./_schemas";
import { resourceIdSchema } from "./_zod";
import type { WithOperationWarnings } from "@workspace/calendar-core";

export const createInviteBodySchema = strictZodObject({
  email: z.string().min(1).max(320),
});

export const revokeInviteParamsSchema = resourceIdParamsSchema;

export const inviteTokenQuerySchema = strictZodObject({
  token: z.string().min(1).max(500),
});

export const claimInviteBodySchema = strictZodObject({
  token: z.string().min(1).max(500),
  chosenEmail: z.string().min(1).max(320),
});

export const createInviteInputSchema = createInviteBodySchema.extend({
  invitedById: resourceIdSchema,
});

export const listInvitesInputSchema = z
  .object({
    invitedById: resourceIdSchema,
  })
  .strict();

export const revokeInviteInputSchema = z
  .object({
    id: resourceIdSchema,
    invitedById: resourceIdSchema,
  })
  .strict();

export const validateInviteTokenInputSchema = inviteTokenQuerySchema;

export const claimInviteInputSchema = claimInviteBodySchema;

export type InviteStatus = "pending" | "claimed" | "accepted" | "revoked";

export type InviteRecord = {
  id: string;
  token: string;
  email: string;
  status: InviteStatus;
  expiresAt: string;
  createdAt: string;
  invitedById: string;
};

export type CreateInviteInput = z.infer<typeof createInviteInputSchema>;
export type CreateInviteResult = WithOperationWarnings<InviteRecord>;
export type ListInvitesInput = z.infer<typeof listInvitesInputSchema>;
export type ListInvitesResult = {
  invites: InviteRecord[];
};
export type RevokeInviteInput = z.infer<typeof revokeInviteInputSchema>;
export type RevokeInviteResult = {
  success: boolean;
};
export type ValidateInviteTokenInput = z.infer<
  typeof validateInviteTokenInputSchema
>;
export type ValidateInviteTokenResult =
  | { valid: true; inviteId: string; email: string; inviterName: string }
  | { valid: false; reason: string };
export type ClaimInviteInput = z.infer<typeof claimInviteInputSchema>;
export type ClaimInviteResult =
  | { success: true; inviteId: string }
  | { success: false; reason: string };

export interface IInviteService {
  createInvite(input: CreateInviteInput): Promise<CreateInviteResult>;
  listInvites(input: ListInvitesInput): Promise<ListInvitesResult>;
  revokeInvite(input: RevokeInviteInput): Promise<RevokeInviteResult>;
  validateInviteToken(
    input: ValidateInviteTokenInput,
  ): Promise<ValidateInviteTokenResult>;
  claimInviteToken(input: ClaimInviteInput): Promise<ClaimInviteResult>;
  checkSignupAllowed(
    email: string,
  ): Promise<{ allowed: boolean; reason?: string }>;
  markInviteAccepted(email: string): Promise<void>;
}
