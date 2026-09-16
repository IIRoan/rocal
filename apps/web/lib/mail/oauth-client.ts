import type { MailOAuthConfig } from "./types";
import { createLogger } from "@workspace/logger";

const log = createLogger("mail-oauth");

const MAIL_OAUTH_TOKEN_EXPIRY_SKEW_MS = 30000;

type MailOAuthTokenResponse = {
  access_token?: string;
  expires_in?: number;
  expires_at?: number;
  error?: string;
  error_description?: string;
  message?: string;
};

type StoredMailOAuthTokens = {
  accessToken: string;
  expiresAtMs: number | null;
};

function parseMailOAuthResponse(
  payload: MailOAuthTokenResponse,
): StoredMailOAuthTokens {
  if (!payload.access_token) {
    throw new Error(
      payload.error_description ||
        payload.message ||
        payload.error ||
        "The mail server did not return an access token.",
    );
  }

  const expiresAtMs =
    typeof payload.expires_at === "number"
      ? payload.expires_at * 1000
      : typeof payload.expires_in === "number"
        ? Date.now() + payload.expires_in * 1000
        : null;

  return {
    accessToken: payload.access_token,
    expiresAtMs,
  };
}

function isAccessTokenFresh(tokens: StoredMailOAuthTokens | null): boolean {
  if (!tokens?.accessToken) {
    return false;
  }

  if (!tokens.expiresAtMs) {
    return true;
  }

  return Date.now() + MAIL_OAUTH_TOKEN_EXPIRY_SKEW_MS < tokens.expiresAtMs;
}

/** The browser sends its session cookie; the backend mints the Stalwart token. */
async function fetchMailTokenFromServer(
  mailTokenEndpoint: string,
): Promise<StoredMailOAuthTokens> {
  const response = await fetch(mailTokenEndpoint, {
    method: "GET",
    credentials: "include",
  });
  const payload = (await response
    .json()
    .catch(() => null)) as MailOAuthTokenResponse | null;
  if (!response.ok || !payload) {
    throw new Error(
      payload?.error_description ||
        payload?.message ||
        payload?.error ||
        "Could not obtain a mail token from the server.",
    );
  }
  return parseMailOAuthResponse(payload);
}

export function createMailOAuthTokenManager(config: MailOAuthConfig) {
  let tokens: StoredMailOAuthTokens | null = null;
  let inflight: Promise<string> | null = null;

  const mintFreshToken = async () => {
    tokens = await fetchMailTokenFromServer(config.mailTokenEndpoint);
    log.info("Minted mail access token via server exchange", {
      expiresAtMs: tokens.expiresAtMs,
      secondsUntilExpiry:
        tokens.expiresAtMs != null
          ? Math.round((tokens.expiresAtMs - Date.now()) / 1000)
          : null,
    });
    return tokens.accessToken;
  };

  return {
    async getAccessToken(): Promise<string> {
      if (isAccessTokenFresh(tokens)) {
        return tokens.accessToken;
      }

      if (inflight) {
        log.debug("Waiting for in-flight mail access token request");
        return inflight;
      }

      inflight = mintFreshToken();

      try {
        const accessToken = await inflight;
        log.debug("Resolved mail access token", {
          expiresAtMs: tokens?.expiresAtMs ?? null,
          secondsUntilExpiry:
            tokens?.expiresAtMs != null
              ? Math.round((tokens.expiresAtMs - Date.now()) / 1000)
              : null,
        });
        return accessToken;
      } finally {
        inflight = null;
      }
    },
    clear() {
      log.warn("Cleared cached mail access token");
      tokens = null;
      inflight = null;
    },
  };
}
