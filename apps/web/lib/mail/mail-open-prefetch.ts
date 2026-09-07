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

export type MailVaultKeyMaterialResult = {
  keyMaterial: string;
  derivedKeyB64: string | null;
  version: string;
  /** True when derivedKeyB64 came from IndexedDB (server skipped argon2). */
  usedCachedDerivedKey: boolean;
};

export type MailOpenPrefetch = {
  key: string;
  userId: string;
  config: MailDemoConfig;
  tokenManager: ReturnType<typeof createMailOAuthTokenManager>;
  client: StalwartJmapClient;
  discoveryPromise: Promise<JmapSession>;
  keyMaterialPromise: Promise<MailVaultKeyMaterialResult | null>;
};

let activePrefetch: MailOpenPrefetch | null = null;

function prefetchKey(userId: string, config: MailDemoConfig): string {
  return [
    userId,
    config.discoveryBaseUrl,
    config.oauth.mailTokenEndpoint ?? "",
    config.vaultKeyMaterialEndpoint,
  ].join("|");
}

/**
 * Fetch vault key material, preferring a browser-cached derived AES key so the
 * API can skip server-side argon2 on repeat opens.
 */
export async function fetchVaultKeyMaterialForOpen(input: {
  endpoint: string;
  userId: string;
}): Promise<MailVaultKeyMaterialResult | null> {
  const cachedDerivedKey = await getStoredDerivedVaultKey(input.userId).catch(
    () => null,
  );

  if (cachedDerivedKey) {
    try {
      const result = await mailDemoApiService.getVaultKeyMaterial(
        input.endpoint,
        { includeDerived: false },
      );
      return {
        keyMaterial: result.keyMaterial,
        derivedKeyB64: cachedDerivedKey,
        version: result.version,
        usedCachedDerivedKey: true,
      };
    } catch (error) {
      log.warn("Cached-derived key-material fetch failed; retrying full", {
        error,
      });
    }
  }

  const result = await mailDemoApiService.getVaultKeyMaterial(input.endpoint, {
    includeDerived: true,
  });
  if (result.derivedKeyB64) {
    void Promise.resolve(
      putStoredDerivedVaultKey(input.userId, result.derivedKeyB64),
    ).catch((error) => {
      log.warn("Failed to persist derived vault key", { error });
    });
  }
  return {
    keyMaterial: result.keyMaterial,
    derivedKeyB64: result.derivedKeyB64 ?? null,
    version: result.version,
    usedCachedDerivedKey: false,
  };
}

/** Drop a bad cached derived key and mint a fresh one from the server. */
export async function refreshVaultKeyMaterialAfterCacheMiss(input: {
  endpoint: string;
  userId: string;
}): Promise<MailVaultKeyMaterialResult | null> {
  await Promise.resolve(deleteStoredDerivedVaultKey(input.userId)).catch(
    () => undefined,
  );
  try {
    const result = await mailDemoApiService.getVaultKeyMaterial(input.endpoint, {
      includeDerived: true,
    });
    if (result.derivedKeyB64) {
      void Promise.resolve(
        putStoredDerivedVaultKey(input.userId, result.derivedKeyB64),
      ).catch(() => undefined);
    }
    return {
      keyMaterial: result.keyMaterial,
      derivedKeyB64: result.derivedKeyB64 ?? null,
      version: result.version,
      usedCachedDerivedKey: false,
    };
  } catch (error) {
    log.warn("Failed to refresh vault key material after cache miss", {
      error,
    });
    return null;
  }
}

/**
 * Warm mail OAuth token + JMAP discovery (+ vault key material) as soon as the
 * session/config are known, so handleSignIn does not start from a cold network.
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

  const keyMaterialPromise = fetchVaultKeyMaterialForOpen({
    endpoint: input.config.vaultKeyMaterialEndpoint,
    userId,
  }).catch((error) => {
    log.warn("Vault key material prefetch failed", { error });
    return null;
  });

  activePrefetch = {
    key,
    userId,
    config: input.config,
    tokenManager,
    client,
    discoveryPromise,
    keyMaterialPromise,
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
