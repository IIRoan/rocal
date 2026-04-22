import { createLogger } from "@workspace/logger";
import { e2eeApiService } from "./e2ee-api-service";
import {
  clearActiveE2eeSession,
  setActiveE2eeSession,
} from "./e2ee-session";
import {
  getStoredE2eeDevice,
  putStoredE2eeDevice,
  type StoredE2eeDeviceRecord,
} from "./e2ee-storage";
import {
  exportWrappingPublicKey,
  generateAccountKey,
  generateBlindIndexKey,
  generateDeviceId,
  generateWrappingKeyPair,
  isWebCryptoAvailable,
  unwrapAccountKey,
  unwrapBlindIndexKey,
  wrapSymmetricKey,
} from "./e2ee-crypto";
import type { E2eeDeviceRecord } from "./types/calendar";

const log = createLogger("e2ee-bootstrap");
const bootstrapPromises = new Map<string, Promise<boolean>>();
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

  const browserNavigator = navigator as NavigatorWithUserAgentData;
  const platform =
    browserNavigator.userAgentData?.platform || navigator.platform || "Browser";
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);

  return isMobile ? `${platform} mobile` : `${platform} browser`;
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
  return (
    activeBootstrapUserId === userId && bootstrapGeneration === generation
  );
}

async function activateFromRemote(
  userId: string,
  generation: number,
  localRecord: StoredE2eeDeviceRecord,
  remoteRecord: E2eeDeviceRecord,
): Promise<boolean> {
  if (!isBootstrapCurrent(userId, generation)) {
    return false;
  }

  const accountKey = await unwrapAccountKey(
    remoteRecord.wrappedAccountKey,
    localRecord.privateKey,
  );
  const blindIndexKey = await unwrapBlindIndexKey(
    remoteRecord.wrappedSearchKey,
    localRecord.privateKey,
  );

  if (!isBootstrapCurrent(userId, generation)) {
    return false;
  }

  setActiveE2eeSession({
    userId,
    deviceId: remoteRecord.deviceId,
    accountKey,
    blindIndexKey,
    activatedAt: new Date(),
  });

  return true;
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

async function createInitialDevice(
  userId: string,
  generation: number,
): Promise<boolean> {
  const wrappingKeyPair = await generateWrappingKeyPair();
  const accountKey = await generateAccountKey();
  const blindIndexKey = await generateBlindIndexKey();
  const publicKey = await exportWrappingPublicKey(wrappingKeyPair.publicKey);
  const wrappedAccountKey = await wrapSymmetricKey(
    accountKey,
    wrappingKeyPair.publicKey,
  );
  const wrappedSearchKey = await wrapSymmetricKey(
    blindIndexKey,
    wrappingKeyPair.publicKey,
  );

  const localRecord: StoredE2eeDeviceRecord = {
    userId,
    deviceId: generateDeviceId(),
    publicKey,
    privateKey: wrappingKeyPair.privateKey,
    wrappedAccountKey,
    wrappedSearchKey,
    wrapAlgorithm: "RSA-OAEP-256",
    keyVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await uploadDevice(localRecord);
  await putStoredE2eeDevice(localRecord);

  if (!isBootstrapCurrent(userId, generation)) {
    return false;
  }

  setActiveE2eeSession({
    userId,
    deviceId: localRecord.deviceId,
    accountKey,
    blindIndexKey,
    activatedAt: new Date(),
  });

  return true;
}

async function bootstrapUser(
  userId: string,
  generation: number,
): Promise<boolean> {
  if (!isWebCryptoAvailable()) {
    clearActiveE2eeSession();
    return false;
  }

  const [remoteBootstrap, localRecord] = await Promise.all([
    e2eeApiService.getBootstrap(),
    getStoredE2eeDevice(userId),
  ]);

  if (!isBootstrapCurrent(userId, generation)) {
    return false;
  }

  const matchingRemote = localRecord
    ? remoteBootstrap.devices.find(
        (device) => device.deviceId === localRecord.deviceId,
      )
    : undefined;

  if (localRecord && matchingRemote) {
    return await activateFromRemote(
      userId,
      generation,
      localRecord,
      matchingRemote,
    );
  }

  if (localRecord && remoteBootstrap.devices.length === 0) {
    const remoteRecord = await uploadDevice(localRecord);

    if (!isBootstrapCurrent(userId, generation)) {
      return false;
    }

    return await activateFromRemote(
      userId,
      generation,
      localRecord,
      remoteRecord,
    );
  }

  if (!localRecord && remoteBootstrap.devices.length === 0) {
    return await createInitialDevice(userId, generation);
  }

  clearActiveE2eeSession();
  log.info(
    "E2EE shadow-write bootstrap exists on another device; local key transfer is not implemented yet.",
    { userId },
  );

  return false;
}

export function ensureE2eeBootstrap(userId: string): Promise<boolean> {
  if (!userId) {
    clearActiveE2eeSession();
    return Promise.resolve(false);
  }

  const generation = beginBootstrap(userId);

  const existing = bootstrapPromises.get(userId);
  if (existing) {
    return existing;
  }

  const bootstrapPromise = bootstrapUser(userId, generation)
    .catch((error) => {
      if (!isBootstrapCurrent(userId, generation)) {
        return false;
      }

      clearActiveE2eeSession();
      log.warn("Failed to initialize E2EE shadow-write bootstrap", {
        userId,
        error,
      });

      return false;
    })
    .finally(() => {
      if (bootstrapPromises.get(userId) === bootstrapPromise) {
        bootstrapPromises.delete(userId);
      }
    });

  bootstrapPromises.set(userId, bootstrapPromise);
  return bootstrapPromise;
}

export function waitForPendingE2eeBootstrap(): Promise<boolean> | null {
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
}