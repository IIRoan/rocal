import { getApiBaseUrl } from "../api-url";
import type {
  MailAccountStatus,
  MailBootstrapRequest,
  MailDemoConfig,
  MailDirectoryKey,
  MailSyncResponse,
  MailSignupResponse,
  MailVaultBackupRecord,
} from "./types";

class MailApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "MailApiError";
  }
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : `Mail API request failed with status ${response.status}.`;
    throw new MailApiError(message, response.status);
  }

  return payload as T;
}

export class MailDemoApiService {
  constructor(private readonly baseUrl: string = getApiBaseUrl()) {}

  async getConfig(): Promise<MailDemoConfig> {
    const response = await fetch(`${this.baseUrl}/api/mail/config`, {
      method: "GET",
      credentials: "include",
    });

    return parseJsonResponse<MailDemoConfig>(response);
  }

  async getAccountStatus(): Promise<MailAccountStatus> {
    const response = await fetch(`${this.baseUrl}/api/mail/account/`, {
      method: "GET",
      credentials: "include",
    });

    return parseJsonResponse<MailAccountStatus>(response);
  }

  async bootstrapAccountMailbox(
    request: MailBootstrapRequest,
  ): Promise<MailSignupResponse> {
    const response = await fetch(`${this.baseUrl}/api/mail/account/bootstrap`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    return parseJsonResponse<MailSignupResponse>(response);
  }

  async getAccountVaultBackup(): Promise<MailVaultBackupRecord> {
    const response = await fetch(
      `${this.baseUrl}/api/mail/account/vault-backup`,
      {
        method: "GET",
        credentials: "include",
      },
    );

    return parseJsonResponse<MailVaultBackupRecord>(response);
  }

  async getRecipientKey(email: string): Promise<MailDirectoryKey> {
    const response = await fetch(
      `${this.baseUrl}/api/mail/keys/${encodeURIComponent(email)}`,
      {
        method: "GET",
        credentials: "include",
      },
    );

    return parseJsonResponse<MailDirectoryKey>(response);
  }

  async upsertAccountVaultBackup(
    request: Omit<MailVaultBackupRecord, "email">,
  ): Promise<MailVaultBackupRecord> {
    const response = await fetch(
      `${this.baseUrl}/api/mail/account/vault-backup`,
      {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      },
    );

    return parseJsonResponse<MailVaultBackupRecord>(response);
  }

  async syncAccount(accountId: string): Promise<MailSyncResponse> {
    const response = await fetch(
      `${this.baseUrl}/api/mail/sync?accountId=${encodeURIComponent(accountId)}`,
      {
        method: "GET",
        credentials: "include",
      },
    );

    return parseJsonResponse<MailSyncResponse>(response);
  }
}

export const mailDemoApiService = new MailDemoApiService();
