import { HttpClient } from "./http-client";

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

export type ListInvitesResponse = {
  invites: InviteRecord[];
};

export type CreateInviteResponse = InviteRecord;

export type RevokeInviteResponse = {
  success: boolean;
};

export type ValidateInviteTokenResponse =
  | { valid: true; inviteId: string; email: string; inviterName: string }
  | { valid: false; reason: string };

export type ClaimInviteResponse =
  | { success: true; inviteId: string }
  | { success: false; reason: string };

export class InviteApiService {
  constructor(private readonly client: HttpClient) {}

  async listInvites(): Promise<ListInvitesResponse> {
    return this.client.get<ListInvitesResponse>("/api/invites");
  }

  async createInvite(email: string): Promise<CreateInviteResponse> {
    return this.client.post<CreateInviteResponse>("/api/invites", { email });
  }

  async revokeInvite(id: string): Promise<RevokeInviteResponse> {
    return this.client.delete<RevokeInviteResponse>(`/api/invites/${encodeURIComponent(id)}`);
  }

  async validateInviteToken(token: string): Promise<ValidateInviteTokenResponse> {
    return this.client.get<ValidateInviteTokenResponse>(
      `/api/account/invite/validate?token=${encodeURIComponent(token)}`,
    );
  }

  async claimInviteToken(
    token: string,
    chosenEmail: string,
  ): Promise<ClaimInviteResponse> {
    return this.client.post<ClaimInviteResponse>("/api/account/invite/claim", {
      token,
      chosenEmail,
    });
  }
}
