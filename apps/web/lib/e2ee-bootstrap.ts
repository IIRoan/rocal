import { resolveDeviceEnvelopeSalt } from "@workspace/e2ee";
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
  rememberStoredDeviceEnvelopeSalt,
  type StoredE2eeDeviceRecord,
} from "./e2ee-storage";
import {
  createPasswordEnvelope,
  decryptJsonPayload,
  encryptJsonPayload,
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
  peekAuthPassword,
  peekPendingAuthPassword,
} from "./e2ee-password-cache";
import type { E2eeBootstrapResponse, E2eeDeviceRecord } from "./types/calendar";

const log = createLogger("e2ee-bootstrap");

export interface E2eeBootstrapAttempt {
  activated: boolean;
  bootstrap: E2eeBootstrapResponse | null;
  passwordUnlockFailed?: boolean;
}

const bootstrapPromises = new Map<string, Promise<E2eeBootstrapAttempt>>();
let bootstrapGeneration = 0;
let activeBootstrapUserId: string | null = null;

function createAttempt(
  activated: boolean,
  bootstrap: E2eeBootstrapResponse | null,
  extras?: { passwordUnlockFailed?: boolean },
): E2eeBootstrapAttempt {
  return {
    activated,
    bootstrap,
    ...(extras?.passwordUnlockFailed ? { passwordUnlockFailed: true } : {}),
  };
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
  // Keys minted while another key's envelope existed must survive sign-out, so a changed envelope is checked again.
  await resolveDeviceEnvelopeSalt(
    { unwrapPasswordEnvelope, encryptJsonPayload, decryptJsonPayload },
    {
      storedSalt: localRecord.envelopeSalt,
      envelope: bootstrap.passwordEnvelope,
      password: peekAuthPassword(),
      accountKey,
    },
  )
    .then((salt) =>
      rememberStoredDeviceEnvelopeSalt(userId, localRecord.deviceId, salt),
    )
    .catch((error: unknown) => {
      log.warn("Failed to check the device key against the envelope", {
        userId,
        error,
      });
    });
  return createAttempt(true, bootstrap);
}

async function uploadDevice(
  localRecord: StoredE2eeDeviceRecord,
): Promise<E2eeDeviceRecord> {
  return e2eeApiService.upsertDevice({
    deviceId: localRecord.deviceId,
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
  envelopeSalt: string | undefined,
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
    envelopeSalt,
  };
}

async function provisionLocalDevice(
  userId: string,
  accountKey: CryptoKey,
  blindIndexKey: CryptoKey,
  envelopeSalt?: string,
): Promise<E2eeDeviceRecord> {
  const localRecord = await createDeviceRecord(
    userId,
    accountKey,
    blindIndexKey,
    envelopeSalt,
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
  // The envelope goes up before the first device, so an interrupted start never leaves keys no sign-in can open.
  const signInPassword = peekPendingAuthPassword();
  const envelope = signInPassword
    ? await createPasswordEnvelope(accountKey, blindIndexKey, signInPassword)
    : null;
  if (envelope) {
    await e2eeApiService.upsertPasswordEnvelope(envelope);
    clearPendingAuthPassword();
  }
  const remoteRecord = await provisionLocalDevice(
    userId,
    accountKey,
    blindIndexKey,
    envelope?.kdfSalt,
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
  const envelope = bootstrap.passwordEnvelope;
  if (!envelope) {
    return createAttempt(false, bootstrap);
  }

  // Only a failed unwrap is a wrong password; a failed device upload below is a network error, not a lock.
  const keys = await unwrapPasswordEnvelope(password, envelope).catch(
    (error: unknown) => {
      log.info("Password did not unlock the E2EE envelope", { userId, error });
      return null;
    },
  );
  if (!keys) {
    clearActiveE2eeSession();
    return createAttempt(false, bootstrap, { passwordUnlockFailed: true });
  }
  const { accountKey, blindIndexKey } = keys;

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
    : (
        await provisionLocalDevice(
          userId,
          accountKey,
          blindIndexKey,
          envelope.kdfSalt,
        )
      ).deviceId;

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
    const authPassword = peekAuthPassword();

    if (authPassword) {
      return activateFromPasswordEnvelope(
        userId,
        generation,
        remoteBootstrap,
        authPassword,
      );
    }

    clearActiveE2eeSession();
    log.info("E2EE envelope exists but no sign-in password is available yet.", {
      userId,
    });
    return createAttempt(false, remoteBootstrap);
  }

  if (remoteBootstrap.devices.length === 0) {
    return createInitialDevice(userId, generation, remoteBootstrap);
  }

  clearActiveE2eeSession();
  log.info("E2EE devices exist without a password envelope; this device cannot unlock.", {
    userId,
  });

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
  await rememberStoredDeviceEnvelopeSalt(
    userId,
    session.deviceId,
    envelope.kdfSalt,
  );
  clearPendingAuthPassword();
  return true;
}

/** Network errors reject; a wrong password resolves with `passwordUnlockFailed`. */
/** Opens the envelope in `bootstrap`, which the caller already fetched, with a password that arrived after it ran. */
export async function unlockE2eeWithPassword(
  userId: string,
  password: string,
  bootstrap: E2eeBootstrapResponse,
): Promise<E2eeBootstrapAttempt> {
  if (!userId || !isWebCryptoAvailable()) {
    return createAttempt(false, null);
  }

  const generation = beginBootstrap(userId);
  return activateFromPasswordEnvelope(userId, generation, bootstrap, password);
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
      log.warn("Failed to initialize E2EE bootstrap", {
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
}
