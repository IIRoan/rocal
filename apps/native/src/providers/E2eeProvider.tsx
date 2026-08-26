import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import * as SecureStore from "expo-secure-store";
import {
  createE2eeModule,
  hydrateEncryptedEventWithoutSession,
  ENCRYPTED_EVENT_PLACEHOLDER_TITLE,
  type E2eeModule,
  type E2eeProvider as IE2eeProvider,
} from "@workspace/e2ee";
import type {
  CalendarEvent,
  CreateCalendarRequest,
  CreateCategoryRequest,
  CreateEventRequest,
  E2eeBootstrapResponse,
  UpdateCalendarRequest,
  UpdateCategoryRequest,
  UpdateEventRequest,
} from "@workspace/calendar-core";
import { createNativeCryptoProvider } from "../lib/native-crypto-provider";
import { SECURE_STORE_KEYS } from "../lib/constants";
import { getE2eeApiUrl } from "../lib/e2ee-api-url";
import { getAuthHeaders } from "../lib/api";
import { shouldAttachEventContentEncryption } from "../lib/e2ee-event-shadow";
import { readChunkedSecureValue, writeChunkedSecureValue } from "../lib/secure-store-chunked";
import { createLogger } from "@workspace/logger";
import { useAuth } from "./AuthProvider";

const log = createLogger("native:e2ee");

interface E2eeSession {
  accountKey: CryptoKey;
  blindIndexKey: CryptoKey;
  deviceId: string;
  userId: string;
  apiBaseUrl: string;
}

export interface E2eeContextValue {
  isReady: boolean;
  isEnabled: boolean;
  provider: IE2eeProvider;
  bootstrap: (userId: string, apiBaseUrl: string) => Promise<void>;
  resetEncryptionPassword: (password: string) => Promise<boolean>;
  clearSession: () => void;
  runWithAccountKey: <T>(
    fn: (accountKey: CryptoKey, e2ee: E2eeModule) => Promise<T>,
  ) => Promise<T | null>;
}

const E2eeContext = createContext<E2eeContextValue | null>(null);

export function E2eeProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const { clearPendingAuthPassword, peekPendingAuthPassword } = useAuth();

  const [isReady, setIsReady] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);

  const sessionRef = useRef<E2eeSession | null>(null);
  const moduleRef = useRef<E2eeModule | null>(null);
  const bootstrapGenerationRef = useRef(0);
  const pendingBootstrapRef = useRef<Promise<void> | null>(null);
  const resolvePendingBootstrapRef = useRef<(() => void) | null>(null);

  const beginPendingBootstrap = useCallback(() => {
    resolvePendingBootstrapRef.current?.();
    pendingBootstrapRef.current = new Promise((resolve) => {
      resolvePendingBootstrapRef.current = resolve;
    });
  }, []);

  const finishPendingBootstrap = useCallback(() => {
    resolvePendingBootstrapRef.current?.();
    resolvePendingBootstrapRef.current = null;
    pendingBootstrapRef.current = null;
  }, []);

  const getModule = useCallback(async (): Promise<E2eeModule | null> => {
    if (moduleRef.current) {
      return moduleRef.current;
    }

    const crypto = createNativeCryptoProvider();
    if (!crypto) {
      return null;
    }

    moduleRef.current = createE2eeModule(crypto);
    return moduleRef.current;
  }, []);

  const registerDeviceForSession = useCallback(
    async ({
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
    }): Promise<E2eeSession> => {
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

      await SecureStore.setItemAsync(
        SECURE_STORE_KEYS.E2EE_DEVICE_ID,
        deviceId,
      );
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
    },
    [],
  );

  const storePasswordEnvelopeForActiveSession = useCallback(
    async ({
      e2ee,
      userId,
      apiBaseUrl,
      password,
    }: {
      e2ee: E2eeModule;
      userId: string;
      apiBaseUrl: string;
      password: string;
    }) => {
      const session = sessionRef.current;

      if (!session) {
        throw new Error("E2EE session is not ready on this device.");
      }

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
        throw new Error(
          `E2EE password registration returned ${response.status}.`,
        );
      }

      clearPendingAuthPassword();
      log.info("Stored native E2EE password envelope for active session", {
        userId,
      });
    },
    [clearPendingAuthPassword],
  );

  const bootstrap = useCallback(
    async (userId: string, apiBaseUrl: string) => {
      const generation = bootstrapGenerationRef.current + 1;
      bootstrapGenerationRef.current = generation;
      const isCurrentBootstrap = () =>
        bootstrapGenerationRef.current === generation;

      sessionRef.current = null;
      setIsEnabled(false);
      setIsReady(false);
      beginPendingBootstrap();

      try {
        const e2ee = await getModule();

        if (!e2ee) {
          log.warn(
            "E2EE is unavailable in the current runtime. Encryption is disabled for this session.",
          );
          if (isCurrentBootstrap()) {
            setIsReady(true);
          }
          return;
        }

        const bootstrapUrl = getE2eeApiUrl(apiBaseUrl, "/bootstrap");
        const response = await fetch(bootstrapUrl, {
          credentials: "omit",
          headers: getAuthHeaders(),
        });

        if (!response.ok) {
          log.warn(
            "E2EE bootstrap endpoint returned a non-OK response",
            {
              status: response.status,
              url: bootstrapUrl,
            },
          );
          if (isCurrentBootstrap()) {
            setIsReady(true);
          }
          return;
        }

        const bootstrapData = (await response.json()) as E2eeBootstrapResponse;

        if (!bootstrapData.enabled) {
          log.info("E2EE is not enabled for this user");
          if (isCurrentBootstrap()) {
            setIsReady(true);
          }
          return;
        }

        if (!isCurrentBootstrap()) {
          return;
        }

        setIsEnabled(true);

        const deviceId = await SecureStore.getItemAsync(
          SECURE_STORE_KEYS.E2EE_DEVICE_ID,
        );
        const privateKeyJwk = await readChunkedSecureValue(
          SECURE_STORE_KEYS.E2EE_PRIVATE_KEY,
        );

        const existingDevice = bootstrapData.devices.find(
          (device) => device.deviceId === deviceId,
        );

        if (existingDevice && privateKeyJwk) {
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
            existingDevice.wrappedAccountKey,
            privateKey,
          );
          const blindIndexKey = await e2ee.unwrapBlindIndexKey(
            existingDevice.wrappedSearchKey,
            privateKey,
          );

          if (!isCurrentBootstrap()) {
            return;
          }

          sessionRef.current = {
            accountKey,
            blindIndexKey,
            deviceId: existingDevice.deviceId,
            userId,
            apiBaseUrl,
          };
          clearPendingAuthPassword();
          log.info("Restored native E2EE session from existing device", {
            userId,
            deviceId: existingDevice.deviceId,
          });
          return;
        }

        const pendingPassword = peekPendingAuthPassword();

        // If a password envelope exists, try to unlock it with the auth
        // password that was captured at sign-in time. This covers email/
        // password users on a new device.
        if (bootstrapData.passwordEnvelope && pendingPassword) {
          try {
            const { accountKey, blindIndexKey } =
              await e2ee.unwrapPasswordEnvelope(
                pendingPassword,
                bootstrapData.passwordEnvelope,
              );
            const nextSession = await registerDeviceForSession({
              e2ee,
              userId,
              apiBaseUrl,
              accountKey,
              blindIndexKey,
            });

            if (!isCurrentBootstrap()) {
              return;
            }

            sessionRef.current = nextSession;
            clearPendingAuthPassword();
            log.info("Unlocked native E2EE with pending auth password", {
              userId,
              deviceId: nextSession.deviceId,
            });
            return;
          } catch (error) {
            log.warn(
              "Pending auth password did not unlock E2EE envelope; starting fresh device session",
              { userId, error },
            );
          }
        }

        if (!isCurrentBootstrap()) {
          return;
        }

        // No envelope, couldn't unlock it, or passkey user — start a fresh
        // E2EE session on this device. Encrypted content from other devices
        // will show as placeholders until the user signs in from an existing
        // device or re-registers.
        if (bootstrapData.passwordEnvelope && !pendingPassword) {
          log.warn(
            "Password envelope exists but no auth password is available; starting fresh E2EE session",
            { userId },
          );
        }

        const accountKey = await e2ee.generateAccountKey();
        const blindIndexKey = await e2ee.generateBlindIndexKey();
        const nextSession = await registerDeviceForSession({
          e2ee,
          userId,
          apiBaseUrl,
          accountKey,
          blindIndexKey,
        });

        if (!isCurrentBootstrap()) {
          return;
        }

        sessionRef.current = nextSession;

        if (pendingPassword) {
          try {
            await storePasswordEnvelopeForActiveSession({
              e2ee,
              userId,
              apiBaseUrl,
              password: pendingPassword,
            });
          } catch (error) {
            log.warn("Failed to auto-store E2EE password envelope", {
              userId,
              error,
            });
          } finally {
            // Drop the sign-in password once this bootstrap is done with it,
            // including failed envelope writes (the unlock path already clears).
            clearPendingAuthPassword();
          }
        }

        return;
      } catch (error) {
        if (isCurrentBootstrap()) {
          log.error("E2EE bootstrap failed:", error);
        }
      } finally {
        if (isCurrentBootstrap()) {
          finishPendingBootstrap();
          setIsReady(true);
        }
      }
    },
    [
      peekPendingAuthPassword,
      clearPendingAuthPassword,
      getModule,
      registerDeviceForSession,
      storePasswordEnvelopeForActiveSession,
      beginPendingBootstrap,
      finishPendingBootstrap,
    ],
  );

  const clearSession = useCallback(() => {
    bootstrapGenerationRef.current += 1;
    sessionRef.current = null;
    finishPendingBootstrap();
    setIsEnabled(false);
    setIsReady(false);
    clearPendingAuthPassword();
  }, [clearPendingAuthPassword, finishPendingBootstrap]);

  const resetEncryptionPassword = useCallback(
    async (password: string) => {
      const session = sessionRef.current;

      if (!session) {
        return false;
      }

      const e2ee = await getModule();
      if (!e2ee) {
        throw new Error("E2EE is unavailable in this runtime.");
      }

      await storePasswordEnvelopeForActiveSession({
        e2ee,
        userId: session.userId,
        apiBaseUrl: session.apiBaseUrl,
        password,
      });

      return true;
    },
    [getModule, storePasswordEnvelopeForActiveSession],
  );

  const provider = useMemo<IE2eeProvider>(() => {
    const getSession = (): E2eeSession | null => sessionRef.current;
    const getRequiredSession = (): E2eeSession => {
      const session = getSession();
      if (!session) {
        throw new Error("Encryption setup has not completed on this device.");
      }
      return session;
    };

    return {
      async attachEventEncryptionShadow<
        T extends CreateEventRequest | UpdateEventRequest,
      >(request: T): Promise<T> {
        const session = getSession();
        if (!session || !shouldAttachEventContentEncryption(request)) {
          return request;
        }

        const title = request.title?.trim() ?? "";

        try {
          const e2ee = await getModule();
          if (!e2ee) {
            return request;
          }

          const description =
            (request as { description?: string | null }).description?.trim() ||
            null;
          const location =
            (request as { location?: string | null }).location?.trim() || null;

          const encrypted = await e2ee.encryptJsonPayload(
            session.accountKey,
            {
              title,
              description,
              location,
            },
            "event-content:v1",
          );

          const blindIndexTokens = await e2ee.createBlindIndexTokens(
            session.blindIndexKey,
            [title, description, location].filter(Boolean).join(" "),
          );

          return {
            ...request,
            encryptedContent: JSON.stringify(encrypted),
            blindIndexTokens,
            encryptionKeyVersion: 1,
          } as T;
        } catch (error) {
          log.error("Failed to encrypt event:", error);
          throw error;
        }
      },

      async attachCalendarEncryptionShadow<
        T extends CreateCalendarRequest | UpdateCalendarRequest,
      >(request: T): Promise<T> {
        try {
          const session = getRequiredSession();
          const e2ee = await getModule();
          if (!e2ee) {
            throw new Error("Native encryption runtime is unavailable.");
          }

          const encrypted = await e2ee.encryptJsonPayload(
            session.accountKey,
            { name: (request as { name?: string }).name },
            "calendar-name:v1",
          );

          const blindIndexTokens = (request as { name?: string }).name
            ? await e2ee.createBlindIndexTokens(
                session.blindIndexKey,
                (request as { name: string }).name,
              )
            : [];

          return {
            ...request,
            encryptedName: JSON.stringify(encrypted),
            blindIndexTokens,
            encryptionKeyVersion: 1,
          } as T;
        } catch (error) {
          log.error("Failed to encrypt calendar:", error);
          throw error;
        }
      },

      async attachCategoryEncryptionShadow<
        T extends CreateCategoryRequest | UpdateCategoryRequest,
      >(request: T): Promise<T> {
        try {
          const session = getRequiredSession();
          const e2ee = await getModule();
          if (!e2ee) {
            throw new Error("Native encryption runtime is unavailable.");
          }

          const encrypted = await e2ee.encryptJsonPayload(
            session.accountKey,
            { name: (request as { name?: string }).name },
            "category-name:v1",
          );

          const blindIndexTokens = (request as { name?: string }).name
            ? await e2ee.createBlindIndexTokens(
                session.blindIndexKey,
                (request as { name: string }).name,
              )
            : [];

          return {
            ...request,
            encryptedName: JSON.stringify(encrypted),
            blindIndexTokens,
            encryptionKeyVersion: 1,
          } as T;
        } catch (error) {
          log.error("Failed to encrypt category:", error);
          throw error;
        }
      },

      async hydrateEncryptedEvent(
        event: CalendarEvent,
      ): Promise<CalendarEvent> {
        if (
          event.encryptionState !== "encrypted" ||
          !event.encryptedContent ||
          typeof event.encryptedContent !== "string"
        ) {
          return event;
        }

        const pendingBootstrap = pendingBootstrapRef.current;
        if (pendingBootstrap && !getSession()) {
          await pendingBootstrap;
        }

        const session = getSession();
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
  }, [getModule]);

  const runWithAccountKey = useCallback(
    async <T,>(
      fn: (accountKey: CryptoKey, e2ee: E2eeModule) => Promise<T>,
    ): Promise<T | null> => {
      const session = sessionRef.current;
      const e2ee = await getModule();
      if (!session || !e2ee) {
        return null;
      }

      return fn(session.accountKey, e2ee);
    },
    [getModule],
  );

  const value = useMemo<E2eeContextValue>(
    () => ({
      isReady,
      isEnabled,
      provider,
      bootstrap,
      resetEncryptionPassword,
      clearSession,
      runWithAccountKey,
    }),
    [
      bootstrap,
      clearSession,
      isEnabled,
      isReady,
      provider,
      resetEncryptionPassword,
      runWithAccountKey,
    ],
  );

  return (
    <E2eeContext.Provider value={value}>
      {children}
    </E2eeContext.Provider>
  );
}


export function useE2ee(): E2eeContextValue {
  const ctx = useContext(E2eeContext);
  if (!ctx) {
    throw new Error("useE2ee must be used within an E2eeProvider");
  }
  return ctx;
}
