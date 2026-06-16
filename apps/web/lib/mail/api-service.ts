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
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "MailApiError";
  }
}

function parseApiErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message;
    }
    if (typeof record.title === "string" && record.title.trim()) {
      const detail =
        typeof record.detail === "string" && record.detail.trim()
          ? `: ${record.detail}`
          : "";
      return `${record.title}${detail}`;
    }
    if (typeof record.error === "string" && record.error.trim()) {
      return record.error;
    }
  }

  return `Mail API request failed with status ${status}.`;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const details =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : undefined;
    throw new MailApiError(
      parseApiErrorMessage(payload, response.status),
      response.status,
      details,
    );
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

  async getVaultKeyMaterial(
    vaultKeyMaterialEndpoint: string,
  ): Promise<{ keyMaterial: string; version: string }> {
    const response = await fetch(vaultKeyMaterialEndpoint, {
      method: "GET",
      credentials: "include",
    });

    return parseJsonResponse<{ keyMaterial: string; version: string }>(response);
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
