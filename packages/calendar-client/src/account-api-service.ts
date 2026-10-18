import type { Schema } from "@workspace/api-contracts";
import { HttpClient } from "./http-client";

export class AccountApiService {
  private signupConfigRequest: Promise<Schema<"SignupConfig">> | null = null;

  constructor(private readonly client: HttpClient) {}

  getSignupConfig(): Promise<Schema<"SignupConfig">> {
    if (!this.signupConfigRequest) {
      this.signupConfigRequest = this.client
        .get<Schema<"SignupConfig">>("/api/account/signup-config")
        .finally(() => {
          this.signupConfigRequest = null;
        });
    }
    return this.signupConfigRequest;
  }

  async checkEmailAvailability(
    email: string,
  ): Promise<Schema<"EmailAvailability">> {
    return this.client.get<Schema<"EmailAvailability">>(
      `/api/account/email-availability?email=${encodeURIComponent(email)}`,
    );
  }

  async getAuthStatus(): Promise<Schema<"AuthStatus">> {
    return this.client.get<Schema<"AuthStatus">>("/api/account/auth-status", {
      cache: "no-store",
      retries: 0,
      timeout: 2_000,
    });
  }
}
