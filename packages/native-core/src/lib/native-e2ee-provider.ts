import * as SecureStore from "expo-secure-store";
import {
  encryptEventContentRequest,
  encryptNameRequest,
  hydrateEncryptedEventWithoutSession,
  hydrateEncryptedName,
  parseEncryptedJsonPayload,
  withDecryptedEventContent,
  withoutPlaintextEventContent,
  withoutPlaintextName,
  type DecryptedEventContent,
  type E2eeModule,
  type E2eeProvider as IE2eeProvider,
} from "@workspace/e2ee";
import type {
  Calendar,
  CalendarEvent,
  EventCategory,
  EventWireRequest,
  NameWireRequest,
  CreateCalendarRequest,
  CreateCategoryRequest,
  CreateEventRequest,
  E2eeBootstrapResponse,
  UpdateCalendarRequest,
  UpdateCategoryRequest,
  UpdateEventRequest,
} from "@workspace/calendar-core";
import type { PasswordEnvelopeRequest } from "@workspace/calendar-client";
import { createLogger } from "@workspace/logger";
import { z } from "@workspace/calendar-core/zod";
import { createNativeCryptoProvider } from "./native-crypto-provider";
import { encryptReminderLead, encryptReminderTitle } from "./notification-title-crypto";
import { SECURE_STORE_KEYS } from "./constants";
import { getE2eeApiUrl } from "./e2ee-api-url";
import { getAuthHeaders } from "./api";
import {
  deleteChunkedSecureValue,
  readChunkedSecureValue,
  writeChunkedSecureValue,
} from "./secure-store-chunked";

const log = createLogger("native:e2ee");

export interface E2eeSession {
  accountKey: CryptoKey;
  blindIndexKey: CryptoKey;
  deviceId: string;
  userId: string;
  apiBaseUrl: string;
}

/** Validate the bootstrap before trusting its device list. */
function isE2eeBootstrapResponse(value: unknown): value is E2eeBootstrapResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.devices)) {
    return false;
  }
  return record.devices.every(
    (device) =>
      typeof device === "object" &&
      device !== null &&
      typeof (device as Record<string, unknown>).deviceId === "string",
  );
}

async function withE2eeRequestTimeout<T>(request: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    return await request(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchE2eeBootstrap(
  apiBaseUrl: string,
): Promise<E2eeBootstrapResponse | null> {
  const bootstrapUrl = getE2eeApiUrl(apiBaseUrl, "/bootstrap");
  return withE2eeRequestTimeout(async (signal) => {
    // repo-rules-allow client-api-boundary: E2EE bootstrap endpoint; @workspace/calendar-client does not expose it.
    const response = await fetch(bootstrapUrl, {
      credentials: "omit",
      headers: getAuthHeaders(),
      signal,
    });

    if (!response.ok) {
      log.warn("E2EE bootstrap endpoint returned a non-OK response", {
        status: response.status,
        url: bootstrapUrl,
      });
      if (response.status === 401 || response.status === 403) return null;
      throw new Error("Encryption setup is temporarily unavailable.");
    }

    const payload: unknown = await response.json();
    if (!isE2eeBootstrapResponse(payload)) {
      throw new Error("Encryption setup could not be validated.");
    }
    return payload;
  });
}

export async function readStoredDevice(bootstrapData: E2eeBootstrapResponse) {
  const deviceId = await SecureStore.getItemAsync(
    SECURE_STORE_KEYS.E2EE_DEVICE_ID,
  );
  const privateKeyJwk = await readChunkedSecureValue(
    SECURE_STORE_KEYS.E2EE_PRIVATE_KEY,
  );
  const envelopeSalt = await SecureStore.getItemAsync(
    SECURE_STORE_KEYS.E2EE_ENVELOPE_SALT,
  );
  const existingDevice = bootstrapData.devices.find(
    (device) => device.deviceId === deviceId,
  );
  return { existingDevice, privateKeyJwk, envelopeSalt };
}

export async function rememberDeviceEnvelopeSalt(
  salt: string | null,
): Promise<void> {
  await (salt
    ? SecureStore.setItemAsync(SECURE_STORE_KEYS.E2EE_ENVELOPE_SALT, salt)
    : SecureStore.deleteItemAsync(SECURE_STORE_KEYS.E2EE_ENVELOPE_SALT));
}

export async function registerDeviceForSession({
  e2ee,
  userId,
  apiBaseUrl,
  accountKey,
  blindIndexKey,
  envelopeSalt,
}: {
  e2ee: E2eeModule;
  userId: string;
  apiBaseUrl: string;
  accountKey: CryptoKey;
  blindIndexKey: CryptoKey;
  /** The envelope these keys came from; null for freshly minted keys. */
  envelopeSalt: string | null;
}): Promise<E2eeSession> {
  const keyPair = await e2ee.generateWrappingKeyPair();
  const [publicKey, wrappedAccountKey, wrappedSearchKey] = await Promise.all([
    e2ee.exportWrappingPublicKey(keyPair.publicKey),
    e2ee.wrapSymmetricKey(accountKey, keyPair.publicKey),
    e2ee.wrapSymmetricKey(blindIndexKey, keyPair.publicKey),
  ]);
  const deviceId = e2ee.generateDeviceId();

  const crypto = createNativeCryptoProvider();
  if (!crypto) {
    throw new Error("Native crypto is unavailable for E2EE device export.");
  }

  const exportedPrivateKey = await crypto.subtle.exportKey(
    "jwk",
    keyPair.privateKey,
  );
  const exportedPrivateKeyJson = JSON.stringify(exportedPrivateKey);

  await withE2eeRequestTimeout(async (signal) => {
    // repo-rules-allow client-api-boundary: E2EE device-registration endpoint; @workspace/calendar-client does not expose it.
    const deviceResponse = await fetch(getE2eeApiUrl(apiBaseUrl, "/device"), {
      method: "PUT",
      credentials: "omit",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        deviceId,
        publicKey,
        wrappedAccountKey,
        wrappedSearchKey,
      }),
    });

    if (!deviceResponse.ok) {
      throw new Error(
        `E2EE device registration returned ${deviceResponse.status}.`,
      );
    }
  });

  // The old device's salt must never vouch for the new key, even if the app dies between writes.
  await rememberDeviceEnvelopeSalt(null);
  await SecureStore.setItemAsync(SECURE_STORE_KEYS.E2EE_DEVICE_ID, deviceId);
  await writeChunkedSecureValue(
    SECURE_STORE_KEYS.E2EE_PRIVATE_KEY,
    exportedPrivateKeyJson,
  );
  await rememberOwnDeviceKeys({ deviceId, wrappedAccountKey, wrappedSearchKey });
  if (envelopeSalt) {
    await rememberDeviceEnvelopeSalt(envelopeSalt);
  }

  return {
    accountKey,
    blindIndexKey,
    deviceId,
    userId,
    apiBaseUrl,
  };
}

/** This device's id when sign-out is about to forget its key pair, so its server row can go while the session lasts. */
export async function recoverableStoredDeviceId(): Promise<string | null> {
  if (!(await SecureStore.getItemAsync(SECURE_STORE_KEYS.E2EE_ENVELOPE_SALT))) {
    return null;
  }
  return SecureStore.getItemAsync(SECURE_STORE_KEYS.E2EE_DEVICE_ID);
}

/** Forgets this device's key pair only when the password envelope is known to hold its account key; otherwise it may be the only copy. */
export async function clearRecoverableStoredDevice(): Promise<void> {
  if (!(await SecureStore.getItemAsync(SECURE_STORE_KEYS.E2EE_ENVELOPE_SALT))) {
    return;
  }
  await Promise.all([
    SecureStore.deleteItemAsync(SECURE_STORE_KEYS.E2EE_DEVICE_ID),
    deleteChunkedSecureValue(SECURE_STORE_KEYS.E2EE_PRIVATE_KEY),
    deleteChunkedSecureValue(SECURE_STORE_KEYS.E2EE_DEVICE_KEYS),
  ]);
  await rememberDeviceEnvelopeSalt(null);
}

const ownDeviceKeysSchema = z.object({
  deviceId: z.string(),
  wrappedAccountKey: z.string(),
  wrappedSearchKey: z.string(),
});

type OwnDeviceKeys = z.infer<typeof ownDeviceKeysSchema>;

async function rememberOwnDeviceKeys(keys: OwnDeviceKeys): Promise<void> {
  await writeChunkedSecureValue(
    SECURE_STORE_KEYS.E2EE_DEVICE_KEYS,
    JSON.stringify(keys),
  );
}

async function readOwnDeviceKeys(deviceId: string): Promise<OwnDeviceKeys | null> {
  const raw = await readChunkedSecureValue(SECURE_STORE_KEYS.E2EE_DEVICE_KEYS);
  if (!raw) return null;
  try {
    const parsed = ownDeviceKeysSchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.deviceId === deviceId ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Opens this device's own wrapped keys; installs from before that copy existed trust the server's once and keep it. */
export async function unwrapStoredDeviceKeys(
  e2ee: E2eeModule,
  privateKeyJwk: string,
  device: OwnDeviceKeys,
): Promise<{ accountKey: CryptoKey; blindIndexKey: CryptoKey }> {
  const crypto = createNativeCryptoProvider();
  if (!crypto) {
    throw new Error("Native crypto is unavailable for E2EE unwrap.");
  }

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    JSON.parse(privateKeyJwk),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["unwrapKey"],
  );

  const own = await readOwnDeviceKeys(device.deviceId);
  const wrapped = own ?? device;
  const accountKey = await e2ee.unwrapAccountKey(
    wrapped.wrappedAccountKey,
    privateKey,
  );
  const blindIndexKey = await e2ee.unwrapBlindIndexKey(
    wrapped.wrappedSearchKey,
    privateKey,
  );
  if (!own) {
    // A failed write only means the next start trusts the server's copy again, never a lost key.
    await rememberOwnDeviceKeys({
      deviceId: device.deviceId,
      wrappedAccountKey: device.wrappedAccountKey,
      wrappedSearchKey: device.wrappedSearchKey,
    }).catch((error: unknown) => {
      log.warn("Failed to keep this device's wrapped keys", {
        errorName: error instanceof Error ? error.name : typeof error,
      });
    });
  }
  return { accountKey, blindIndexKey };
}

export async function putPasswordEnvelope({
  e2ee,
  session,
  apiBaseUrl,
  password,
}: {
  e2ee: E2eeModule;
  session: E2eeSession;
  apiBaseUrl: string;
  password: string;
}): Promise<void> {
  await uploadPasswordEnvelope(
    apiBaseUrl,
    await e2ee.createPasswordEnvelope(
      session.accountKey,
      session.blindIndexKey,
      password,
    ),
  );
}

/** Stores an envelope already wrapped with the password, and remembers its salt as this device's. */
export async function uploadPasswordEnvelope(
  apiBaseUrl: string,
  envelope: PasswordEnvelopeRequest,
): Promise<void> {
  await withE2eeRequestTimeout(async (signal) => {
    // repo-rules-allow client-api-boundary: E2EE password-envelope endpoint; @workspace/calendar-client does not expose it.
    const response = await fetch(getE2eeApiUrl(apiBaseUrl, "/password"), {
      method: "PUT",
      credentials: "omit",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(envelope),
    });

    if (!response.ok) {
      throw new Error(`E2EE password registration returned ${response.status}.`);
    }
  });
  await rememberDeviceEnvelopeSalt(envelope.kdfSalt);
}

export function createNativeE2eeProvider({
  getSession,
  getPendingBootstrap,
  getModule,
}: {
  getSession: () => E2eeSession | null;
  getPendingBootstrap: () => Promise<void> | null;
  getModule: () => Promise<E2eeModule | null>;
}): IE2eeProvider {
  const waitForSession = async (): Promise<E2eeSession | null> => {
    const pendingBootstrap = getPendingBootstrap();
    if (pendingBootstrap && !getSession()) {
      await pendingBootstrap;
    }
    return getSession();
  };

  const encryptWith = async <T>(
    kind: string,
    encrypt: (e2ee: E2eeModule, session: E2eeSession) => Promise<T>,
    withoutSession: () => T,
  ): Promise<T> => {
    try {
      const session = await waitForSession();
      const e2ee = session ? await getModule() : null;
      return session && e2ee ? await encrypt(e2ee, session) : withoutSession();
    } catch (error) {
      log.error(`Failed to encrypt ${kind}:`, error);
      throw error;
    }
  };

  const provider: IE2eeProvider = {
    async attachEventEncryptionShadow<
      T extends CreateEventRequest | UpdateEventRequest,
    >(request: T): Promise<EventWireRequest<T>> {
      return encryptWith(
        "event",
        (e2ee, session) => encryptEventContentRequest(e2ee, session, request),
        () => withoutPlaintextEventContent(request),
      );
    },

    async attachCalendarEncryptionShadow<
      T extends CreateCalendarRequest | UpdateCalendarRequest,
    >(request: T): Promise<NameWireRequest<T>> {
      return encryptWith(
        "calendar",
        (e2ee, session) => encryptNameRequest(e2ee, session, "calendar", request),
        () => withoutPlaintextName(request),
      );
    },

    async attachCategoryEncryptionShadow<
      T extends CreateCategoryRequest | UpdateCategoryRequest,
    >(request: T): Promise<NameWireRequest<T>> {
      return encryptWith(
        "category",
        (e2ee, session) => encryptNameRequest(e2ee, session, "category", request),
        () => withoutPlaintextName(request),
      );
    },

    async hydrateEncryptedCalendar(calendar: Calendar): Promise<Calendar> {
      if (!calendar.encryptedName) {
        return calendar;
      }

      const session = await waitForSession();
      const e2ee = session ? await getModule() : null;
      return hydrateEncryptedName(e2ee, session, "calendar", calendar);
    },

    async hydrateEncryptedCategory(
      category: EventCategory,
    ): Promise<EventCategory> {
      if (!category.encryptedName) {
        return category;
      }

      const session = await waitForSession();
      const e2ee = session ? await getModule() : null;
      return hydrateEncryptedName(e2ee, session, "category", category);
    },

    async hasActiveSession(): Promise<boolean> {
      return (await waitForSession()) !== null;
    },

    async hydrateEncryptedEvent(event: CalendarEvent): Promise<CalendarEvent> {
      if (
        event.encryptionState !== "encrypted" ||
        !event.encryptedContent ||
        typeof event.encryptedContent !== "string"
      ) {
        return event;
      }

      const session = await waitForSession();
      if (!session) {
        return hydrateEncryptedEventWithoutSession(event);
      }

      try {
        const e2ee = await getModule();
        if (!e2ee) {
          return hydrateEncryptedEventWithoutSession(event);
        }

        const payload = JSON.parse(event.encryptedContent);
        const decrypted = await e2ee.decryptJsonPayload<DecryptedEventContent>(
          session.accountKey,
          payload,
          "event-content:v1",
        );

        return withDecryptedEventContent(event, decrypted);
      } catch {
        return hydrateEncryptedEventWithoutSession(event);
      }
    },

    async hydrateEncryptedEvents(
      events: CalendarEvent[],
    ): Promise<CalendarEvent[]> {
      return Promise.all(
        events.map((event) => provider.hydrateEncryptedEvent(event)),
      );
    },

    async createBlindIndexTokens(value: string): Promise<string[]> {
      const session = getSession();
      if (!session) {
        return [];
      }

      try {
        const e2ee = await getModule();
        if (!e2ee) {
          return [];
        }

        return e2ee.createBlindIndexTokens(session.blindIndexKey, value);
      } catch {
        return [];
      }
    },

    async encryptJson(value: unknown, aad: string): Promise<string> {
      return encryptWith(
        "settings",
        async (e2ee, session) =>
          JSON.stringify(await e2ee.encryptJsonPayload(session.accountKey, value, aad)),
        () => {
          throw new Error("Encrypted data is not unlocked on this device.");
        },
      );
    },

    async decryptJson(encrypted: string, aad: string): Promise<unknown> {
      const session = await waitForSession();
      const e2ee = session ? await getModule() : null;
      const payload = parseEncryptedJsonPayload(encrypted);
      if (!session || !e2ee || !payload) {
        return null;
      }
      return e2ee
        .decryptJsonPayload<unknown>(session.accountKey, payload, aad)
        .catch(() => null);
    },

    async encryptNotificationLead(
      eventId: string,
      minutesBefore: number,
    ): Promise<string | undefined> {
      const session = await waitForSession();
      return session
        ? encryptReminderLead(session.accountKey, eventId, minutesBefore)
        : undefined;
    },

    async encryptNotificationTitle(
      eventId: string,
      title: string,
    ): Promise<string | undefined> {
      const session = await waitForSession();
      const sealed = session
        ? await encryptReminderTitle(session.accountKey, eventId, title)
        : null;
      return sealed ?? undefined;
    },
  };
  return provider;
}
