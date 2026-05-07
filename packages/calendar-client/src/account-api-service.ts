import { HttpClient } from "./http-client";

export type AccountSignupConfigResponse = {
  defaultEmailDomain: string;
};

export type CheckEmailAvailabilityCode =
  | "available"
  | "invalid_email"
  | "already_in_use";

export type CheckEmailAvailabilityResponse = {
  email: string;
  localPart: string | null;
  domain: string;
  normalizedEmail: string;
  available: boolean;
  code: CheckEmailAvailabilityCode;
  message: string;
};

export class AccountApiService {
  constructor(private readonly client: HttpClient) {}

  async getSignupConfig(): Promise<AccountSignupConfigResponse> {
    return this.client.get<AccountSignupConfigResponse>(
      "/api/account/signup-config",
    );
  }

  async checkEmailAvailability(
    email: string,
  ): Promise<CheckEmailAvailabilityResponse> {
    return this.client.get<CheckEmailAvailabilityResponse>(
      `/api/account/email-availability?email=${encodeURIComponent(email)}`,
    );
  }
}