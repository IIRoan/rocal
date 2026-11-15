import type { Schema } from "@workspace/api-contracts";
import { HttpClient, type ApiResponse } from "./http-client";

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

  getRecoveryKit(): Promise<ApiResponse<"RecoveryKitStatus">> {
    return this.client.get<Schema<"RecoveryKitStatus">>("/api/e2ee/recovery-kit", {
      cache: "no-store",
    });
  }

  putRecoveryKit(
    request: Schema<"RecoveryKitRequest">,
  ): Promise<ApiResponse<"RecoveryKitStatus">> {
    return this.client.put<Schema<"RecoveryKitStatus">>(
      "/api/e2ee/recovery-kit",
      request,
      { retries: 0 },
    );
  }

  deleteRecoveryKit(): Promise<ApiResponse<"SuccessMessage">> {
    return this.client.delete<Schema<"SuccessMessage">>("/api/e2ee/recovery-kit");
  }
}
