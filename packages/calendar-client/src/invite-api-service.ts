import type { Schema } from "@workspace/api-contracts";
import type { ApiResponse, HttpClient } from "./http-client";

export type InviteRecord = ApiResponse<"Invite">;

export type ValidateInviteTokenResponse = Schema<"InviteValidation">;

export type ClaimInviteResponse = Schema<"InviteClaimResult">;

export class InviteApiService {
  constructor(private readonly client: HttpClient) {}

  async listInvites(): Promise<ApiResponse<"InviteList">> {
    return this.client.get<Schema<"InviteList">>("/api/invites");
  }

  async createInvite(email: string): Promise<InviteRecord> {
    return this.client.post<Schema<"Invite">>("/api/invites", {
      email,
    } satisfies Schema<"CreateInviteRequest">);
  }

  async revokeInvite(id: string): Promise<Schema<"SuccessFlag">> {
    return this.client.delete<Schema<"SuccessFlag">>(
      `/api/invites/${encodeURIComponent(id)}`,
    );
  }

  async validateInviteToken(
    token: string,
  ): Promise<ValidateInviteTokenResponse> {
    return this.client.get<Schema<"InviteValidation">>(
      `/api/account/invite/validate?token=${encodeURIComponent(token)}`,
    );
  }

  async claimInviteToken(
    token: string,
    chosenEmail: string,
  ): Promise<ClaimInviteResponse> {
    return this.client.post<Schema<"InviteClaimResult">>(
      "/api/account/invite/claim",
      { token, chosenEmail } satisfies Schema<"ClaimInviteRequest">,
    );
  }
}
