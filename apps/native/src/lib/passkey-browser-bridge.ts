import * as Linking from "expo-linking";
import { createLogger } from "@workspace/logger";
import type { PasskeyRouteClient } from "./passkey-auth";
import { CALENDAR_HOME_ROUTE, SETTINGS_ROUTE } from "./auth-routing";
import { API_BASE_URL, APP_BASE_URL } from "./constants";

export type BrowserPasskeyMode = "sign-in" | "register";

interface BrowserAuthSessionResult {
  type: string;
  url?: string | null;
}

interface BrowserPasskeySubscription {
  remove: () => void;
}

interface BrowserPasskeyDependencies {
  appBaseUrl: string;
  createCallbackUrl: (path: string) => string;
  openAuthSessionAsync: (
    startUrl: string,
    callbackUrl: string,
  ) => Promise<BrowserAuthSessionResult>;
  addUrlListener: (
    listener: (url: string) => void,
  ) => BrowserPasskeySubscription;
}

const PASSKEY_BRIDGE_PATH = "/passkey/native";
const PASSKEY_TOKEN_QUERY_PARAM = "oneTimeToken";
const PASSKEY_REGISTERED_QUERY_PARAM = "passkeyRegistered";
const PASSKEY_ERROR_QUERY_PARAM = "error";
const AUTH_SESSION_CALLBACK_GRACE_MS = 1500;
const log = createLogger("native:passkey-bridge");
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isPasskeyBridgeOriginSecure(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || LOOPBACK_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

function getInsecurePasskeyBridgeMessage(appBaseUrl: string): string {
  return `Passkeys require an HTTPS app URL (or localhost). The current browser bridge URL is ${appBaseUrl}. Set EXPO_PUBLIC_APP_URL to an https:// tunnel or hosted frontend.`;
}

export function resolvePasskeyBridgeBaseUrl(
  apiBaseUrl = API_BASE_URL,
  explicitAppBaseUrl = APP_BASE_URL,
): string {
  if (explicitAppBaseUrl) {
    return normalizeBaseUrl(explicitAppBaseUrl);
  }

  const apiUrl = new URL(apiBaseUrl);
  const appUrl = new URL(apiUrl.origin);

  if (apiUrl.port === "4001") {
    appUrl.port = "4000";
  }

  return normalizeBaseUrl(appUrl.toString());
}

export function buildPasskeyBridgeUrl(options: {
  appBaseUrl: string;
  mode: BrowserPasskeyMode;
  callbackUrl: string;
  bridgeToken?: string;
  passkeyName?: string;
}): string {
  const url = new URL(
    `${normalizeBaseUrl(options.appBaseUrl)}${PASSKEY_BRIDGE_PATH}`,
  );

  url.searchParams.set("mode", options.mode);
  url.searchParams.set("callbackURL", options.callbackUrl);

  if (options.bridgeToken) {
    url.searchParams.set("bridgeToken", options.bridgeToken);
  }

  if (options.passkeyName) {
    url.searchParams.set("passkeyName", options.passkeyName);
  }

  return url.toString();
}

export function parsePasskeyBridgeCallback(urlString: string): {
  oneTimeToken: string | null;
  passkeyRegistered: boolean;
  error: string | null;
} {
  const url = new URL(urlString);

  return {
    oneTimeToken: url.searchParams.get(PASSKEY_TOKEN_QUERY_PARAM),
    passkeyRegistered:
      url.searchParams.get(PASSKEY_REGISTERED_QUERY_PARAM) === "1",
    error: url.searchParams.get(PASSKEY_ERROR_QUERY_PARAM),
  };
}

export async function signInWithBrowserPasskey(
  client: PasskeyRouteClient,
  dependencies = getDefaultDependencies(),
): Promise<unknown> {
  if (!isPasskeyBridgeOriginSecure(dependencies.appBaseUrl)) {
    const message = getInsecurePasskeyBridgeMessage(dependencies.appBaseUrl);
    log.error("Refusing insecure passkey sign-in bridge", {
      appBaseUrl: dependencies.appBaseUrl,
    });
    throw new Error(message);
  }

  const callbackUrl = dependencies.createCallbackUrl(CALENDAR_HOME_ROUTE);
  const startUrl = buildPasskeyBridgeUrl({
    appBaseUrl: dependencies.appBaseUrl,
    mode: "sign-in",
    callbackUrl,
  });

  log.info("Starting browser passkey sign-in", {
    callbackUrl: summarizeUrl(callbackUrl),
    startUrl: summarizeUrl(startUrl),
  });

  const resultUrl = await resolveAuthSessionCallback(
    {
      startUrl,
      callbackUrl,
      cancelMessage: "Passkey sign-in was cancelled.",
    },
    dependencies,
  );
  const parsed = parsePasskeyBridgeCallback(resultUrl);

  log.info("Received browser passkey callback", {
    callbackUrl: summarizeUrl(resultUrl),
    hasOneTimeToken: Boolean(parsed.oneTimeToken),
    hasError: Boolean(parsed.error),
  });

  if (parsed.error) {
    log.error("Browser passkey sign-in returned error", {
      error: parsed.error,
    });
    throw new Error(parsed.error);
  }

  if (!parsed.oneTimeToken) {
    throw new Error(
      "Passkey sign-in did not finish correctly. Please try again.",
    );
  }

  const verified = await verifyOneTimeToken(client, parsed.oneTimeToken);
  log.ok("Browser passkey sign-in completed");
  return verified;
}

export async function registerBrowserPasskey(
  client: PasskeyRouteClient,
  passkeyName: string,
  dependencies = getDefaultDependencies(),
): Promise<void> {
  if (!isPasskeyBridgeOriginSecure(dependencies.appBaseUrl)) {
    const message = getInsecurePasskeyBridgeMessage(dependencies.appBaseUrl);
    log.error("Refusing insecure passkey registration bridge", {
      appBaseUrl: dependencies.appBaseUrl,
    });
    throw new Error(message);
  }

  const bridgeToken = await generateOneTimeToken(client);
  const callbackUrl = dependencies.createCallbackUrl(SETTINGS_ROUTE);
  const startUrl = buildPasskeyBridgeUrl({
    appBaseUrl: dependencies.appBaseUrl,
    mode: "register",
    callbackUrl,
    bridgeToken,
    passkeyName,
  });

  log.info("Starting browser passkey registration", {
    callbackUrl: summarizeUrl(callbackUrl),
    startUrl: summarizeUrl(startUrl),
    passkeyName,
  });

  const resultUrl = await resolveAuthSessionCallback(
    {
      startUrl,
      callbackUrl,
      cancelMessage: "Passkey setup was cancelled.",
    },
    dependencies,
  );
  const parsed = parsePasskeyBridgeCallback(resultUrl);

  log.info("Received browser passkey registration callback", {
    callbackUrl: summarizeUrl(resultUrl),
    passkeyRegistered: parsed.passkeyRegistered,
    hasError: Boolean(parsed.error),
  });

  if (parsed.error) {
    log.error("Browser passkey registration returned error", {
      error: parsed.error,
    });
    throw new Error(parsed.error);
  }

  if (!parsed.passkeyRegistered) {
    throw new Error(
      "Passkey setup did not finish correctly. Please try again.",
    );
  }

  log.ok("Browser passkey registration completed");
}

function getDefaultDependencies(): BrowserPasskeyDependencies {
  return {
    appBaseUrl: resolvePasskeyBridgeBaseUrl(),
    createCallbackUrl: (path: string) => Linking.createURL(path),
    addUrlListener: (listener: (url: string) => void) =>
      Linking.addEventListener("url", (event) => {
        listener(event.url);
      }),
    openAuthSessionAsync: async (startUrl: string, callbackUrl: string) => {
      const Browser = await import("expo-web-browser");
      return Browser.openAuthSessionAsync(startUrl, callbackUrl);
    },
  };
}

async function resolveAuthSessionCallback(
  options: {
    startUrl: string;
    callbackUrl: string;
    cancelMessage: string;
  },
  dependencies: BrowserPasskeyDependencies,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let subscription: BrowserPasskeySubscription | null = null;
    let cancelTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (!settled) {
        settled = true;
      }
      if (cancelTimer) {
        clearTimeout(cancelTimer);
        cancelTimer = null;
      }
      subscription?.remove();
      subscription = null;
    };

    subscription = dependencies.addUrlListener((url) => {
      log.debug("Observed linking callback event", {
        url: summarizeUrl(url),
        expectedCallbackUrl: summarizeUrl(options.callbackUrl),
      });

      if (!matchesAuthCallbackUrl(url, options.callbackUrl)) {
        log.debug("Ignoring unrelated linking callback event", {
          url: summarizeUrl(url),
        });
        return;
      }

      cleanup();
      resolve(url);
    });

    void dependencies
      .openAuthSessionAsync(options.startUrl, options.callbackUrl)
      .then((result) => {
        if (settled) {
          return;
        }

        log.info("Auth session finished", {
          type: result.type,
          url: summarizeUrl(result.url),
          expectedCallbackUrl: summarizeUrl(options.callbackUrl),
        });

        if (
          result.url &&
          matchesAuthCallbackUrl(result.url, options.callbackUrl)
        ) {
          cleanup();
          resolve(result.url);
          return;
        }

        log.warn(
          "Auth session ended before callback arrived; waiting for grace period",
          {
            graceMs: AUTH_SESSION_CALLBACK_GRACE_MS,
            type: result.type,
            url: summarizeUrl(result.url),
          },
        );

        cancelTimer = setTimeout(() => {
          if (settled) {
            return;
          }

          cleanup();
          reject(new Error(options.cancelMessage));
        }, AUTH_SESSION_CALLBACK_GRACE_MS);
      })
      .catch((error) => {
        if (settled) {
          return;
        }

        log.error("Auth session failed", error);
        cleanup();
        reject(error);
      });
  });
}

async function generateOneTimeToken(
  client: PasskeyRouteClient,
): Promise<string> {
  log.debug("Generating browser passkey bridge token");
  const result = await client.$fetch<{ token: string }>(
    "/one-time-token/generate",
    {
      method: "GET",
      throw: false,
    },
  );

  if (!result.data?.token) {
    log.error("Failed to generate browser passkey bridge token", result.error);
    throw new Error("Unable to start passkey setup.");
  }

  log.debug("Generated browser passkey bridge token");
  return result.data.token;
}

async function verifyOneTimeToken(
  client: PasskeyRouteClient,
  token: string,
): Promise<unknown> {
  log.debug("Verifying browser passkey one-time token");
  const result = await client.$fetch("/one-time-token/verify", {
    method: "POST",
    body: { token },
    throw: false,
  });

  if (!result.data) {
    log.error("Failed to verify browser passkey one-time token", result.error);
    throw new Error(
      result.error?.message ?? "Unable to finish passkey sign-in.",
    );
  }

  log.debug("Verified browser passkey one-time token");
  return result.data;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function matchesAuthCallbackUrl(url: string, callbackUrl: string): boolean {
  return stripQueryAndHash(url) === stripQueryAndHash(callbackUrl);
}

function stripQueryAndHash(url: string): string {
  const queryIndex = url.indexOf("?");
  const hashIndex = url.indexOf("#");
  const endIndex =
    queryIndex === -1
      ? hashIndex
      : hashIndex === -1
        ? queryIndex
        : Math.min(queryIndex, hashIndex);

  return endIndex === -1 ? url : url.slice(0, endIndex);
}

function summarizeUrl(url?: string | null): string | null {
  if (!url) {
    return null;
  }

  const baseUrl = stripQueryAndHash(url);

  try {
    const parsed = new URL(url);
    const keys = Array.from(parsed.searchParams.keys());
    return keys.length === 0 ? baseUrl : `${baseUrl}?${keys.join(",")}`;
  } catch {
    return baseUrl;
  }
}
