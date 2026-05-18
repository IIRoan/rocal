import type { MailOAuthConfig } from "./types";

const MAIL_OAUTH_CALLBACK_MESSAGE_SOURCE = "solace-mail-oauth-callback";
const MAIL_OAUTH_REQUEST_TIMEOUT_MS = 10000;
const MAIL_OAUTH_TOKEN_EXPIRY_SKEW_MS = 30000;

type MailOAuthCallbackMessage = {
  source: typeof MAIL_OAUTH_CALLBACK_MESSAGE_SOURCE;
  state: string | null;
  code?: string | null;
  error?: string | null;
  errorDescription?: string | null;
};

type MailOAuthTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  id_token?: string;
  error?: string;
  error_description?: string;
  message?: string;
};

type StoredMailOAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAtMs: number | null;
};

export function appendMailOAuthResourceParams(
  params: URLSearchParams,
  audiences: string[],
): URLSearchParams {
  for (const audience of audiences
    .map((entry) => entry.trim())
    .filter(Boolean)) {
    params.append("resource", audience);
  }

  return params;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function createPkcePair(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
}> {
  const verifierBytes = new Uint8Array(32);
  crypto.getRandomValues(verifierBytes);
  const codeVerifier = base64UrlEncode(verifierBytes);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier),
  );

  return {
    codeVerifier,
    codeChallenge: base64UrlEncode(new Uint8Array(digest)),
  };
}

function getMailOAuthRedirectOrigin(config: MailOAuthConfig): string {
  return new URL(config.redirectUri).origin;
}

function parseMailOAuthResponse(
  payload: MailOAuthTokenResponse,
): StoredMailOAuthTokens {
  if (!payload.access_token) {
    throw new Error(
      payload.error_description ||
        payload.message ||
        payload.error ||
        "The mail OAuth provider did not return an access token.",
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
    refreshToken: payload.refresh_token || null,
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

async function postTokenRequest(
  config: MailOAuthConfig,
  body: URLSearchParams,
): Promise<StoredMailOAuthTokens> {
  const response = await fetch(config.tokenEndpoint, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const payload = (await response
    .json()
    .catch(() => null)) as MailOAuthTokenResponse | null;

  if (!response.ok || !payload) {
    throw new Error(
      payload?.error_description ||
        payload?.error ||
        "Could not exchange the mail OAuth code for a token.",
    );
  }

  return parseMailOAuthResponse(payload);
}

async function exchangeAuthorizationCode(input: {
  config: MailOAuthConfig;
  code: string;
  codeVerifier: string;
}): Promise<StoredMailOAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: input.config.clientId,
    redirect_uri: input.config.redirectUri,
    code: input.code,
    code_verifier: input.codeVerifier,
  });

  appendMailOAuthResourceParams(body, input.config.audiences);

  return postTokenRequest(input.config, body);
}

async function refreshAuthorizationToken(input: {
  config: MailOAuthConfig;
  refreshToken: string;
}): Promise<StoredMailOAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: input.config.clientId,
    refresh_token: input.refreshToken,
  });

  appendMailOAuthResourceParams(body, input.config.audiences);

  return postTokenRequest(input.config, body);
}

export function buildMailOAuthAuthorizeUrl(input: {
  config: MailOAuthConfig;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(input.config.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.config.clientId);
  url.searchParams.set("redirect_uri", input.config.redirectUri);
  url.searchParams.set("scope", input.config.scopes.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "none");
  appendMailOAuthResourceParams(url.searchParams, input.config.audiences);
  return url.toString();
}

export function buildMailOAuthCallbackMessage(
  search: string,
): MailOAuthCallbackMessage {
  const params = new URLSearchParams(search);

  return {
    source: MAIL_OAUTH_CALLBACK_MESSAGE_SOURCE,
    state: params.get("state"),
    code: params.get("code"),
    error: params.get("error"),
    errorDescription: params.get("error_description"),
  };
}

async function requestAuthorizationCode(
  config: MailOAuthConfig,
): Promise<{ code: string; codeVerifier: string }> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Silent mail sign-in is only available in the browser.");
  }

  if (!config.redirectUri) {
    throw new Error("The mail OAuth redirect URI is not configured.");
  }

  const { codeVerifier, codeChallenge } = await createPkcePair();
  const state = crypto.randomUUID();
  const expectedOrigin = getMailOAuthRedirectOrigin(config);

  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.display = "none";

    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timeoutId);
      iframe.remove();
    };

    const onMessage = (event: MessageEvent<MailOAuthCallbackMessage>) => {
      if (event.origin !== expectedOrigin) {
        return;
      }

      const data = event.data;

      if (!data || data.source !== MAIL_OAUTH_CALLBACK_MESSAGE_SOURCE) {
        return;
      }

      if (data.state !== state) {
        return;
      }

      cleanup();

      if (data.error) {
        reject(
          new Error(
            data.errorDescription ||
              data.error ||
              "Silent mail sign-in was rejected.",
          ),
        );
        return;
      }

      if (!data.code) {
        reject(
          new Error(
            "Silent mail sign-in did not return an authorization code.",
          ),
        );
        return;
      }

      resolve({
        code: data.code,
        codeVerifier,
      });
    };

    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "Silent mail sign-in timed out before the auth server returned a code.",
        ),
      );
    }, MAIL_OAUTH_REQUEST_TIMEOUT_MS);

    window.addEventListener("message", onMessage);
    iframe.src = buildMailOAuthAuthorizeUrl({
      config,
      state,
      codeChallenge,
    });
    document.body.appendChild(iframe);
  });
}

/**
 * Call the server-side session-exchange endpoint and parse the result.
 * The browser sends its session cookie automatically via `credentials: "include"`.
 */
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
    if (config.mailTokenEndpoint) {
      tokens = await fetchMailTokenFromServer(config.mailTokenEndpoint);
      return tokens.accessToken;
    }

    const { code, codeVerifier } = await requestAuthorizationCode(config);
    tokens = await exchangeAuthorizationCode({
      config,
      code,
      codeVerifier,
    });
    return tokens.accessToken;
  };

  const refreshOrMintToken = async () => {
    if (tokens?.refreshToken) {
      try {
        const refreshed = await refreshAuthorizationToken({
          config,
          refreshToken: tokens.refreshToken,
        });

        tokens = {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken || tokens.refreshToken,
          expiresAtMs: refreshed.expiresAtMs,
        };

        return tokens.accessToken;
      } catch {
        tokens = null;
      }
    }

    return mintFreshToken();
  };

  return {
    async getAccessToken(): Promise<string> {
      if (isAccessTokenFresh(tokens)) {
        return tokens.accessToken;
      }

      if (inflight) {
        return inflight;
      }

      inflight = refreshOrMintToken();

      try {
        return await inflight;
      } finally {
        inflight = null;
      }
    },
    clear() {
      tokens = null;
      inflight = null;
    },
  };
}
