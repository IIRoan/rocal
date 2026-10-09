/** Native mail HTTP helpers; requests carry the Better Auth session cookie manually since RN fetch does not. */
import type {
  MailAccountStatus,
  MailBootstrapRequest,
  MailDemoConfig,
  MailSignupResponse,
  MailVaultKdfParams,
} from "./types";
import { API_BASE_URL } from "@workspace/native-core/lib/constants";
import { getAuthHeaders } from "@workspace/native-core/lib/api";
import { persistRenewedSessionCookie } from "@workspace/native-core/lib/session-cookie";
import {
  createMailAccessTokenManager,
  type MailAccessToken,
} from "@workspace/calendar-client";

export type { MailAccessToken } from "@workspace/calendar-client";

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

const backendBaseUrl = normalizeBaseUrl(API_BASE_URL);

export class MailApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "MailApiError";
  }
}

/** `fetch` wrapper that injects the native Better Auth headers; shared with the JMAP client transport. */
export async function mailFetch(input: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
    ...getAuthHeaders(),
  };
  // repo-rules-allow client-api-boundary: Solace mail API + JMAP transport with native Better Auth headers.
  const response = await fetch(input, { ...init, headers, credentials: "omit" });
  await persistRenewedSessionCookie(response.headers, new Headers(headers));
  return response;
}

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "message" in payload &&
      typeof (payload as { message?: unknown }).message === "string"
        ? (payload as { message: string }).message
        : `Mail API request failed with status ${response.status}.`;
    throw new MailApiError(message, response.status);
  }

  return payload as T;
}

export async function getMailConfig(): Promise<MailDemoConfig> {
  const response = await mailFetch(`${backendBaseUrl}/api/mail/config`, {
    method: "GET",
  });
  return parseJson<MailDemoConfig>(response);
}

export async function getMailAccountStatus(): Promise<MailAccountStatus> {
  const response = await mailFetch(`${backendBaseUrl}/api/mail/account/`, {
    method: "GET",
  });
  return parseJson<MailAccountStatus>(response);
}

export async function bootstrapAccountMailbox(
  request: MailBootstrapRequest,
): Promise<MailSignupResponse> {
  const response = await mailFetch(`${backendBaseUrl}/api/mail/account/bootstrap`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  return parseJson<MailSignupResponse>(response);
}

export async function upsertAccountVaultBackup(request: {
  vaultVersion: number;
  encryptedVaultB64: string;
  kdf: string;
  kdfParams: MailVaultKdfParams;
  wrappedSecret?: string | null;
  wrapAlgorithm?: string | null;
}) {
  const response = await mailFetch(`${backendBaseUrl}/api/mail/account/vault-backup`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  return parseJson(response);
}

export type MailDirectoryKey = {
  email: string;
  publicKeyArmored: string;
  fingerprint: string;
  algorithm: string;
};

export async function getRecipientKey(email: string): Promise<MailDirectoryKey> {
  const response = await mailFetch(
    `${backendBaseUrl}/api/mail/keys/${encodeURIComponent(email)}`,
    { method: "GET" },
  );
  return parseJson<MailDirectoryKey>(response);
}

type MailTokenResponse = {
  access_token?: string;
  expires_in?: number;
  expires_at?: number;
  error?: string;
  error_description?: string;
  message?: string;
};

async function fetchMailAccessToken(
  mailTokenEndpoint: string,
): Promise<MailAccessToken> {
  const response = await mailFetch(mailTokenEndpoint, { method: "GET" });
  const payload = (await response
    .json()
    .catch(() => null)) as MailTokenResponse | null;

  if (!response.ok || !payload?.access_token) {
    throw new MailApiError(
      payload?.error_description ||
        payload?.message ||
        payload?.error ||
        "Could not obtain a mail token from the server.",
      response.status,
    );
  }

  const expiresAtMs =
    typeof payload.expires_at === "number"
      ? payload.expires_at * 1000
      : typeof payload.expires_in === "number"
        ? Date.now() + payload.expires_in * 1000
        : null;

  return { accessToken: payload.access_token, expiresAtMs };
}

export function createServerMailTokenManager(mailTokenEndpoint: string) {
  return createMailAccessTokenManager(() =>
    fetchMailAccessToken(mailTokenEndpoint),
  );
}
