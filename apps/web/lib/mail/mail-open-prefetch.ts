import { createLogger } from "@workspace/logger";
import { createMailOAuthTokenManager } from "./oauth-client";
import { StalwartJmapClient } from "./jmap-client";
import { mailDemoApiService } from "./api-service";
import {
  deleteStoredDerivedVaultKey,
  getStoredDerivedVaultKey,
  putStoredDerivedVaultKey,
} from "./derived-vault-key-storage";
import type { JmapSession, MailDemoConfig } from "./types";

const log = createLogger("mail-open-prefetch");

export type MailOpenPrefetch = {
  key: string;
  userId: string;
  config: MailDemoConfig;
  tokenManager: ReturnType<typeof createMailOAuthTokenManager>;
  client: StalwartJmapClient;
  discoveryPromise: Promise<JmapSession>;
};

let activePrefetch: MailOpenPrefetch | null = null;

function prefetchKey(userId: string, config: MailDemoConfig): string {
  return [
    userId,
    config.discoveryBaseUrl,
    config.oauth.mailTokenEndpoint ?? "",
  ].join("|");
}

/**
 * Warm the mail OAuth token and JMAP discovery as soon as the session/config
 * are known, so handleSignIn does not start from a cold network.
 */
export function ensureMailOpenPrefetch(input: {
  userId: string;
  config: MailDemoConfig;
}): MailOpenPrefetch {
  const userId = input.userId.trim();
  const key = prefetchKey(userId, input.config);
  if (activePrefetch?.key === key) {
    return activePrefetch;
  }

  clearMailOpenPrefetch();

  const tokenManager = createMailOAuthTokenManager(input.config.oauth);
  const client = new StalwartJmapClient({
    baseUrl: input.config.discoveryBaseUrl,
    getAccessToken: () => tokenManager.getAccessToken(),
    onUnauthorized: async () => {
      tokenManager.clear();
      client.clearCachedSession();
      try {
        await tokenManager.getAccessToken();
      } catch (error) {
        log.warn("Prefetch client could not refresh mail token", { error });
      }
    },
  });

  // Kick token mint immediately; discovery awaits the same inflight token.
  void tokenManager.getAccessToken().catch((error) => {
    log.warn("Mail token prefetch failed", { error });
  });

  const discoveryPromise = client.discoverSession().catch((error) => {
    log.warn("JMAP discovery prefetch failed", { error });
    throw error;
  });

  activePrefetch = {
    key,
    userId,
    config: input.config,
    tokenManager,
    client,
    discoveryPromise,
  };

  log.debug("Started mail open prefetch", { userId });
  return activePrefetch;
}

export function getMailOpenPrefetch(input?: {
  userId: string;
  config: MailDemoConfig;
}): MailOpenPrefetch | null {
  if (!activePrefetch) return null;
  if (!input) return activePrefetch;
  const key = prefetchKey(input.userId.trim(), input.config);
  return activePrefetch.key === key ? activePrefetch : null;
}

export function clearMailOpenPrefetch(): void {
  if (!activePrefetch) return;
  activePrefetch.tokenManager.clear();
  activePrefetch.client.clearCachedSession();
  activePrefetch = null;
}
