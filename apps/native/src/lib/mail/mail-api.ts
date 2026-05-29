/**
 * Native mail HTTP API helpers.
 *
 * All requests target the backend (`API_BASE_URL`) and must include the
 * Better Auth session cookie manually, since React Native's `fetch` does not
 * attach cookies automatically (mirrors the calendar `HttpClient` pattern).
 */
import type { MailAccountStatus, MailDemoConfig } from "./types";
import { API_BASE_URL } from "../constants";
import { getAuthHeaders } from "../api";

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

/**
 * `fetch` wrapper that injects the auth cookie and `credentials: "include"`.
 * Exposed so the JMAP client can reuse the same authenticated transport.
 */
export function mailFetch(input: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
    ...getAuthHeaders(),
  };
  return fetch(input, { ...init, headers, credentials: "include" });
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

type MailTokenResponse = {
  access_token?: string;
  expires_in?: number;
  expires_at?: number;
  error?: string;
  error_description?: string;
  message?: string;
};

export type MailAccessToken = {
  accessToken: string;
  expiresAtMs: number | null;
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

const TOKEN_EXPIRY_SKEW_MS = 30_000;

/**
 * Creates a server-minted access-token provider. The browser-only silent
 * OAuth (iframe) path used by the web app is intentionally omitted — native
 * always exchanges the session cookie for a token at `mailTokenEndpoint`.
 */
export function createServerMailTokenManager(mailTokenEndpoint: string) {
  let token: MailAccessToken | null = null;
  let inflight: Promise<string> | null = null;

  const isFresh = () =>
    token?.accessToken != null &&
    (token.expiresAtMs == null ||
      Date.now() + TOKEN_EXPIRY_SKEW_MS < token.expiresAtMs);

  const mint = async () => {
    token = await fetchMailAccessToken(mailTokenEndpoint);
    return token.accessToken;
  };

  return {
    async getAccessToken(): Promise<string> {
      if (isFresh() && token) return token.accessToken;
      if (inflight) return inflight;
      inflight = mint();
      try {
        return await inflight;
      } finally {
        inflight = null;
      }
    },
    clear() {
      token = null;
      inflight = null;
    },
  };
}
