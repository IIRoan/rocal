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

export type CreateInviteInput = {
  invitedById: string;
  email: string;
};

export type CreateInviteResult = InviteRecord;

export type ListInvitesInput = {
  invitedById: string;
};

export type ListInvitesResult = {
  invites: InviteRecord[];
};

export type RevokeInviteInput = {
  id: string;
  invitedById: string;
};

export type RevokeInviteResult = {
  success: boolean;
};

export type ValidateInviteTokenInput = {
  token: string;
};

export type ValidateInviteTokenResult =
  | { valid: true; inviteId: string; email: string; inviterName: string }
  | { valid: false; reason: string };

export type ClaimInviteInput = {
  token: string;
  chosenEmail: string;
};

export type ClaimInviteResult =
  | { success: true; inviteId: string }
  | { success: false; reason: string };

export interface IInviteService {
  createInvite(input: CreateInviteInput): Promise<CreateInviteResult>;
  listInvites(input: ListInvitesInput): Promise<ListInvitesResult>;
  revokeInvite(input: RevokeInviteInput): Promise<RevokeInviteResult>;
  validateInviteToken(input: ValidateInviteTokenInput): Promise<ValidateInviteTokenResult>;
  claimInviteToken(input: ClaimInviteInput): Promise<ClaimInviteResult>;
  checkSignupAllowed(email: string): Promise<{ allowed: boolean; reason?: string }>;
  markInviteAccepted(email: string): Promise<void>;
}
