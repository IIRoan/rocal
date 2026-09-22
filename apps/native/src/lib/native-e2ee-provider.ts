import * as SecureStore from "expo-secure-store";
import {
  encryptEventContentRequest,
  encryptNameRequest,
  hydrateEncryptedEventWithoutSession,
  hydrateEncryptedName,
  shouldEncryptEventContent,
  ENCRYPTED_EVENT_PLACEHOLDER_TITLE,
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
import { createLogger } from "@workspace/logger";
import { createNativeCryptoProvider } from "./native-crypto-provider";
import { SECURE_STORE_KEYS } from "./constants";
import { getE2eeApiUrl } from "./e2ee-api-url";
import { getAuthHeaders } from "./api";
import {
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

export async function fetchE2eeBootstrap(
  apiBaseUrl: string,
): Promise<E2eeBootstrapResponse | null> {
  const bootstrapUrl = getE2eeApiUrl(apiBaseUrl, "/bootstrap");
  const response = await fetch(bootstrapUrl, {
    credentials: "omit",
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    log.warn("E2EE bootstrap endpoint returned a non-OK response", {
      status: response.status,
      url: bootstrapUrl,
    });
    return null;
  }

  return (await response.json()) as E2eeBootstrapResponse;
}

export async function readStoredDevice(bootstrapData: E2eeBootstrapResponse) {
  const deviceId = await SecureStore.getItemAsync(
    SECURE_STORE_KEYS.E2EE_DEVICE_ID,
  );
  const privateKeyJwk = await readChunkedSecureValue(
    SECURE_STORE_KEYS.E2EE_PRIVATE_KEY,
  );
  const existingDevice = bootstrapData.devices.find(
    (device) => device.deviceId === deviceId,
  );
  return { existingDevice, privateKeyJwk };
}

export async function registerDeviceForSession({
  e2ee,
  userId,
  apiBaseUrl,
  accountKey,
  blindIndexKey,
}: {
  e2ee: E2eeModule;
  userId: string;
  apiBaseUrl: string;
  accountKey: CryptoKey;
  blindIndexKey: CryptoKey;
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

  const deviceResponse = await fetch(getE2eeApiUrl(apiBaseUrl, "/device"), {
    method: "PUT",
    credentials: "omit",
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

  await SecureStore.setItemAsync(SECURE_STORE_KEYS.E2EE_DEVICE_ID, deviceId);
  await writeChunkedSecureValue(
    SECURE_STORE_KEYS.E2EE_PRIVATE_KEY,
    exportedPrivateKeyJson,
  );

  return {
    accountKey,
    blindIndexKey,
    deviceId,
    userId,
    apiBaseUrl,
  };
}

export async function unwrapStoredDeviceKeys(
  e2ee: E2eeModule,
  privateKeyJwk: string,
  device: { wrappedAccountKey: string; wrappedSearchKey: string },
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

  const accountKey = await e2ee.unwrapAccountKey(
    device.wrappedAccountKey,
    privateKey,
  );
  const blindIndexKey = await e2ee.unwrapBlindIndexKey(
    device.wrappedSearchKey,
    privateKey,
  );
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
  const envelope = await e2ee.createPasswordEnvelope(
    session.accountKey,
    session.blindIndexKey,
    password,
  );

  const response = await fetch(getE2eeApiUrl(apiBaseUrl, "/password"), {
    method: "PUT",
    credentials: "omit",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(envelope),
  });

  if (!response.ok) {
    throw new Error(`E2EE password registration returned ${response.status}.`);
  }
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
  const getRequiredSession = (): E2eeSession => {
    const session = getSession();
    if (!session) {
      throw new Error("Encryption setup has not completed on this device.");
    }
    return session;
  };

  const provider: IE2eeProvider = {
    async attachEventEncryptionShadow<
      T extends CreateEventRequest | UpdateEventRequest,
    >(request: T): Promise<EventWireRequest<T>> {
      const session = getSession();
      if (!session || !shouldEncryptEventContent(request)) {
        return request;
      }

      try {
        const e2ee = await getModule();
        if (!e2ee) {
          return request;
        }

        return await encryptEventContentRequest(e2ee, session, request);
      } catch (error) {
        log.error("Failed to encrypt event:", error);
        throw error;
      }
    },

    async attachCalendarEncryptionShadow<
      T extends CreateCalendarRequest | UpdateCalendarRequest,
    >(request: T): Promise<NameWireRequest<T>> {
      try {
        const session = getRequiredSession();
        const e2ee = await getModule();
        if (!e2ee) {
          throw new Error("Native encryption runtime is unavailable.");
        }

        return await encryptNameRequest(e2ee, session, "calendar", request);
      } catch (error) {
        log.error("Failed to encrypt calendar:", error);
        throw error;
      }
    },

    async attachCategoryEncryptionShadow<
      T extends CreateCategoryRequest | UpdateCategoryRequest,
    >(request: T): Promise<NameWireRequest<T>> {
      try {
        const session = getRequiredSession();
        const e2ee = await getModule();
        if (!e2ee) {
          throw new Error("Native encryption runtime is unavailable.");
        }

        return await encryptNameRequest(e2ee, session, "category", request);
      } catch (error) {
        log.error("Failed to encrypt category:", error);
        throw error;
      }
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
        const decrypted = await e2ee.decryptJsonPayload<{
          title: string;
          description?: string | null;
          location?: string | null;
        }>(session.accountKey, payload, "event-content:v1");

        return {
          ...event,
          title:
            decrypted.title?.trim() ||
            event.title?.trim() ||
            ENCRYPTED_EVENT_PLACEHOLDER_TITLE,
          description: decrypted.description ?? null,
          location: decrypted.location ?? null,
        };
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
  };
  return provider;
}
