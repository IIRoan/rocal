import type { MailOAuthConfig } from "./types";
import { createMailAccessTokenManager } from "@workspace/calendar-client";

type StoredMailOAuthTokens = {
  accessToken: string;
  expiresAtMs: number | null;
};

function readErrorDetail(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { error_description, message, error } = value as Record<
    string,
    unknown
  >;
  for (const candidate of [error_description, message, error]) {
    if (typeof candidate === "string") return candidate;
  }
  return undefined;
}

function parseMailOAuthResponse(payload: unknown): StoredMailOAuthTokens {
  const record =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)
      : {};
  const accessToken =
    typeof record.access_token === "string" ? record.access_token : undefined;
  if (!accessToken) {
    throw new Error(
      readErrorDetail(payload) ??
        "The mail server did not return an access token.",
    );
  }

  const expiresAtMs =
    typeof record.expires_at === "number"
      ? record.expires_at * 1000
      : typeof record.expires_in === "number"
        ? Date.now() + record.expires_in * 1000
        : null;

  return {
    accessToken,
    expiresAtMs,
  };
}

/** The browser sends its session cookie; the backend mints the Stalwart token. */
async function fetchMailTokenFromServer(
  mailTokenEndpoint: string,
): Promise<StoredMailOAuthTokens> {
  // repo-rules-allow client-api-boundary: Solace mail-token endpoint; @workspace/calendar-client does not expose it.
  const response = await fetch(mailTokenEndpoint, {
    method: "GET",
    credentials: "include",
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || payload === null) {
    throw new Error(
      readErrorDetail(payload) ??
        "Could not obtain a mail token from the server.",
    );
  }
  return parseMailOAuthResponse(payload);
}

export function createMailOAuthTokenManager(config: MailOAuthConfig) {
  return createMailAccessTokenManager(() =>
    fetchMailTokenFromServer(config.mailTokenEndpoint),
  );
}
