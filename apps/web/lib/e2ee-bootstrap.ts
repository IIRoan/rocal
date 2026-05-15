import { createLogger } from "@workspace/logger";
import { e2eeApiService } from "./e2ee-api-service";
import {
  clearActiveE2eeSession,
  getActiveE2eeSession,
  setActiveE2eeSession,
} from "./e2ee-session";
import {
  getStoredE2eeDevice,
  putStoredE2eeDevice,
  type StoredE2eeDeviceRecord,
} from "./e2ee-storage";
import {
  createPasswordEnvelope,
  exportWrappingPublicKey,
  generateAccountKey,
  generateBlindIndexKey,
  generateDeviceId,
  generateWrappingKeyPair,
  isWebCryptoAvailable,
  unwrapAccountKey,
  unwrapBlindIndexKey,
  unwrapPasswordEnvelope,
  wrapSymmetricKey,
} from "./e2ee-crypto";
import {
  clearPendingAuthPassword,
  consumePendingAuthPassword,
} from "./e2ee-password-cache";
import type { E2eeBootstrapResponse, E2eeDeviceRecord } from "./types/calendar";
import { detectRuntime, getRuntimeDisplayName } from "@workspace/runtime";

const log = createLogger("e2ee-bootstrap");

export interface E2eeBootstrapAttempt {
  activated: boolean;
  bootstrap: E2eeBootstrapResponse | null;
}

const bootstrapPromises = new Map<string, Promise<E2eeBootstrapAttempt>>();
let bootstrapGeneration = 0;
let activeBootstrapUserId: string | null = null;

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    platform?: string;
  };
};

function buildDeviceLabel(): string | undefined {
  if (typeof navigator === "undefined") {
    return undefined;
  }

  const runtime = detectRuntime();
  const browserNavigator = navigator as NavigatorWithUserAgentData;
  const platform =
    browserNavigator.userAgentData?.platform || navigator.platform || "Browser";
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);
  const runtimeLabel = getRuntimeDisplayName(runtime);
  const deviceLabel = isMobile ? "mobile" : "browser";

  if (runtime.kind === "browser") {
    return isMobile ? `${platform} mobile` : `${platform} browser`;
  }

  return `${runtimeLabel} ${platform} ${deviceLabel}`;
}

function createAttempt(
  activated: boolean,
  bootstrap: E2eeBootstrapResponse | null,
): E2eeBootstrapAttempt {
  return { activated, bootstrap };
}

function beginBootstrap(userId: string): number {
  if (activeBootstrapUserId !== userId) {
    bootstrapGeneration += 1;
    activeBootstrapUserId = userId;
    bootstrapPromises.clear();
    clearActiveE2eeSession();
  }

  return bootstrapGeneration;
}

function isBootstrapCurrent(userId: string, generation: number): boolean {
  return activeBootstrapUserId === userId && bootstrapGeneration === generation;
}

function activateSession(
  userId: string,
  deviceId: string,
  accountKey: CryptoKey,
  blindIndexKey: CryptoKey,
): void {
  setActiveE2eeSession({
    userId,
    deviceId,
    accountKey,
    blindIndexKey,
    activatedAt: new Date(),
  });
}

async function activateFromRemote(
  userId: string,
  generation: number,
  localRecord: StoredE2eeDeviceRecord,
  remoteRecord: E2eeDeviceRecord,
  bootstrap: E2eeBootstrapResponse,
): Promise<E2eeBootstrapAttempt> {
  if (!isBootstrapCurrent(userId, generation)) {
    return createAttempt(false, bootstrap);
  }

  const [accountKey, blindIndexKey] = await Promise.all([
    unwrapAccountKey(remoteRecord.wrappedAccountKey, localRecord.privateKey),
    unwrapBlindIndexKey(remoteRecord.wrappedSearchKey, localRecord.privateKey),
  ]);

  if (!isBootstrapCurrent(userId, generation)) {
    return createAttempt(false, bootstrap);
  }

  activateSession(userId, remoteRecord.deviceId, accountKey, blindIndexKey);
  return createAttempt(true, bootstrap);
}

async function uploadDevice(
  localRecord: StoredE2eeDeviceRecord,
): Promise<E2eeDeviceRecord> {
  return e2eeApiService.upsertDevice({
    deviceId: localRecord.deviceId,
    deviceLabel: buildDeviceLabel(),
    publicKey: localRecord.publicKey,
    publicKeyAlgorithm: "RSA-OAEP-256",
    wrappedAccountKey: localRecord.wrappedAccountKey,
    wrappedSearchKey: localRecord.wrappedSearchKey,
    wrapAlgorithm: localRecord.wrapAlgorithm,
    keyVersion: localRecord.keyVersion,
  });
}

async function createDeviceRecord(
  userId: string,
  accountKey: CryptoKey,
  blindIndexKey: CryptoKey,
): Promise<StoredE2eeDeviceRecord> {
  const wrappingKeyPair = await generateWrappingKeyPair();
  const [publicKey, wrappedAccountKey, wrappedSearchKey] = await Promise.all([
    exportWrappingPublicKey(wrappingKeyPair.publicKey),
    wrapSymmetricKey(accountKey, wrappingKeyPair.publicKey),
    wrapSymmetricKey(blindIndexKey, wrappingKeyPair.publicKey),
  ]);
  const timestamp = new Date().toISOString();

  return {
    userId,
    deviceId: generateDeviceId(),
    publicKey,
    privateKey: wrappingKeyPair.privateKey,
    wrappedAccountKey,
    wrappedSearchKey,
    wrapAlgorithm: "RSA-OAEP-256",
    keyVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function provisionLocalDevice(
  userId: string,
  accountKey: CryptoKey,
  blindIndexKey: CryptoKey,
): Promise<E2eeDeviceRecord> {
  const localRecord = await createDeviceRecord(
    userId,
    accountKey,
    blindIndexKey,
  );
  const remoteRecord = await uploadDevice(localRecord);
  await putStoredE2eeDevice(localRecord);
  return remoteRecord;
}

async function createInitialDevice(
  userId: string,
  generation: number,
  bootstrap: E2eeBootstrapResponse,
): Promise<E2eeBootstrapAttempt> {
  const [accountKey, blindIndexKey] = await Promise.all([
    generateAccountKey(),
    generateBlindIndexKey(),
  ]);
  const remoteRecord = await provisionLocalDevice(
    userId,
    accountKey,
    blindIndexKey,
  );

  if (!isBootstrapCurrent(userId, generation)) {
    return createAttempt(false, bootstrap);
  }

  activateSession(userId, remoteRecord.deviceId, accountKey, blindIndexKey);
  return createAttempt(true, {
    ...bootstrap,
    devices: [remoteRecord, ...bootstrap.devices],
  });
}

async function activateFromPasswordEnvelope(
  userId: string,
  generation: number,
  bootstrap: E2eeBootstrapResponse,
  password: string,
): Promise<E2eeBootstrapAttempt> {
  if (!bootstrap.passwordEnvelope) {
    return createAttempt(false, bootstrap);
  }

  const { accountKey, blindIndexKey } = await unwrapPasswordEnvelope(
    password,
    bootstrap.passwordEnvelope,
  );

  if (!isBootstrapCurrent(userId, generation)) {
    return createAttempt(false, bootstrap);
  }

  const localRecord = await getStoredE2eeDevice(userId);
  const matchingRemote = localRecord
    ? bootstrap.devices.find(
        (device) => device.deviceId === localRecord.deviceId,
      )
    : undefined;

  const deviceId = matchingRemote
    ? matchingRemote.deviceId
    : (await provisionLocalDevice(userId, accountKey, blindIndexKey)).deviceId;

  if (!isBootstrapCurrent(userId, generation)) {
    return createAttempt(false, bootstrap);
  }

  activateSession(userId, deviceId, accountKey, blindIndexKey);
  clearPendingAuthPassword();
  return createAttempt(true, bootstrap);
}

async function bootstrapUser(
  userId: string,
  generation: number,
): Promise<E2eeBootstrapAttempt> {
  if (!isWebCryptoAvailable()) {
    clearActiveE2eeSession();
    return createAttempt(false, null);
  }

  const [remoteBootstrap, localRecord] = await Promise.all([
    e2eeApiService.getBootstrap(),
    getStoredE2eeDevice(userId),
  ]);

  if (!isBootstrapCurrent(userId, generation)) {
    return createAttempt(false, remoteBootstrap);
  }

  const matchingRemote = localRecord
    ? remoteBootstrap.devices.find(
        (device) => device.deviceId === localRecord.deviceId,
      )
    : undefined;

  if (localRecord && matchingRemote) {
    return activateFromRemote(
      userId,
      generation,
      localRecord,
      matchingRemote,
      remoteBootstrap,
    );
  }

  if (localRecord) {
    const remoteRecord = await uploadDevice(localRecord);

    if (!isBootstrapCurrent(userId, generation)) {
      return createAttempt(false, remoteBootstrap);
    }

    return activateFromRemote(userId, generation, localRecord, remoteRecord, {
      ...remoteBootstrap,
      devices: [remoteRecord, ...remoteBootstrap.devices],
    });
  }

  if (remoteBootstrap.passwordEnvelope) {
    const pendingPassword = consumePendingAuthPassword();

    if (pendingPassword) {
      try {
        return await activateFromPasswordEnvelope(
          userId,
          generation,
          remoteBootstrap,
          pendingPassword,
        );
      } catch (error) {
        log.info("Pending auth password did not unlock E2EE envelope", {
          userId,
          error,
        });
      }
    }
  }

  if (remoteBootstrap.devices.length === 0) {
    return createInitialDevice(userId, generation, remoteBootstrap);
  }

  clearActiveE2eeSession();

  if (remoteBootstrap.passwordEnvelope) {
    log.info("E2EE bootstrap requires password unlock on this device.", {
      userId,
    });
  } else {
    log.info(
      "E2EE shadow-write bootstrap exists on another device; password migration is required.",
      { userId },
    );
  }

  return createAttempt(false, remoteBootstrap);
}

export async function storePasswordEnvelopeForActiveSession(
  userId: string,
  password: string,
): Promise<boolean> {
  const session = getActiveE2eeSession();

  if (!session || session.userId !== userId) {
    return false;
  }

  const envelope = await createPasswordEnvelope(
    session.accountKey,
    session.blindIndexKey,
    password,
  );

  await e2eeApiService.upsertPasswordEnvelope(envelope);
  clearPendingAuthPassword();
  return true;
}

export async function unlockE2eeWithPassword(
  userId: string,
  password: string,
): Promise<boolean> {
  if (!userId || !isWebCryptoAvailable()) {
    return false;
  }

  const generation = beginBootstrap(userId);
  const bootstrap = await e2eeApiService.getBootstrap();

  if (!bootstrap.passwordEnvelope) {
    return false;
  }

  try {
    const result = await activateFromPasswordEnvelope(
      userId,
      generation,
      bootstrap,
      password,
    );
    return result.activated;
  } catch (error) {
    log.info("Failed to unlock E2EE envelope with password", { userId, error });
    return false;
  }
}

export function ensureE2eeBootstrap(
  userId: string,
): Promise<E2eeBootstrapAttempt> {
  if (!userId) {
    clearActiveE2eeSession();
    return Promise.resolve(createAttempt(false, null));
  }

  const generation = beginBootstrap(userId);

  const existing = bootstrapPromises.get(userId);
  if (existing) {
    return existing;
  }

  const bootstrapPromise = bootstrapUser(userId, generation)
    .catch((error) => {
      if (!isBootstrapCurrent(userId, generation)) {
        return createAttempt(false, null);
      }

      clearActiveE2eeSession();
      log.warn("Failed to initialize E2EE shadow-write bootstrap", {
        userId,
        error,
      });

      return createAttempt(false, null);
    })
    .finally(() => {
      if (bootstrapPromises.get(userId) === bootstrapPromise) {
        bootstrapPromises.delete(userId);
      }
    });

  bootstrapPromises.set(userId, bootstrapPromise);
  return bootstrapPromise;
}

export function waitForPendingE2eeBootstrap(): Promise<unknown> | null {
  if (!activeBootstrapUserId) {
    return null;
  }

  return bootstrapPromises.get(activeBootstrapUserId) ?? null;
}

export function resetE2eeBootstrap(): void {
  bootstrapGeneration += 1;
  activeBootstrapUserId = null;
  bootstrapPromises.clear();
  clearActiveE2eeSession();
  clearPendingAuthPassword();
}
