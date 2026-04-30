import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  UpdateCalendarRequest,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  CreateEventRequest,
  UpdateEventRequest,
} from "@workspace/calendar-core";
import { createNativeCryptoProvider } from "../lib/native-crypto-provider";
import { SECURE_STORE_KEYS } from "../lib/constants";
import { createLogger } from "@workspace/logger";

const log = createLogger("native:e2ee");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface E2eeSession {
  accountKey: CryptoKey;
  blindIndexKey: CryptoKey;
  deviceId: string;
}

export interface E2eeContextValue {
  /** Whether the E2EE module has finished bootstrapping. */
  isReady: boolean;
  /** Whether E2EE is enabled for the current user. */
  isEnabled: boolean;
  /** The E2EE provider instance for use with CalendarApiService. */
  provider: IE2eeProvider;
  /** Trigger E2EE bootstrap (called after authentication). */
  bootstrap: (userId: string, apiBaseUrl: string) => Promise<void>;
  /** Clear the E2EE session (called on sign-out). */
  clearSession: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const E2eeContext = createContext<E2eeContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function E2eeProvider({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  const [isReady, setIsReady] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const sessionRef = useRef<E2eeSession | null>(null);
  const moduleRef = useRef<E2eeModule | null>(null);

  // Lazily initialise the E2EE module (needs native crypto at runtime).
  const getModule = useCallback((): E2eeModule => {
    if (!moduleRef.current) {
      const crypto = createNativeCryptoProvider();
      moduleRef.current = createE2eeModule(crypto);
    }
    return moduleRef.current;
  }, []);

  // ── Bootstrap ──────────────────────────────────────────────────────────

  const bootstrap = useCallback(
    async (userId: string, apiBaseUrl: string) => {
      try {
        const e2ee = getModule();

        // 1. Fetch bootstrap data from the backend.
        const response = await fetch(`${apiBaseUrl}/e2ee/bootstrap`, {
          credentials: "include",
        });

        if (!response.ok) {
          log.warn("E2EE bootstrap endpoint returned", response.status);
          setIsReady(true);
          return;
        }

        const bootstrapData = await response.json();

        if (!bootstrapData.enabled) {
          log.info("E2EE is not enabled for this user");
          setIsReady(true);
          return;
        }

        setIsEnabled(true);

        // 2. Check if this device already has a registered key pair.
        let deviceId = await SecureStore.getItemAsync(
          SECURE_STORE_KEYS.E2EE_DEVICE_ID,
        );
        let privateKeyJwk = await SecureStore.getItemAsync(
          SECURE_STORE_KEYS.E2EE_PRIVATE_KEY,
        );

        const existingDevice = bootstrapData.devices?.find(
          (d: any) => d.deviceId === deviceId,
        );

        if (existingDevice && privateKeyJwk) {
          // Device is already enrolled — unwrap the account & blind-index keys.
          const crypto = createNativeCryptoProvider();
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

          sessionRef.current = {
            accountKey,
            blindIndexKey,
            deviceId: deviceId!,
          };
        } else {
          // New device — generate a key pair and enroll.
          const keyPair = await e2ee.generateWrappingKeyPair();
          const publicKeyB64 = await e2ee.exportWrappingPublicKey(
            keyPair.publicKey,
          );

          // We need an account key. If there's a password envelope we can
          // derive it; otherwise generate fresh keys (first device).
          let accountKey: CryptoKey;
          let blindIndexKey: CryptoKey;

          if (bootstrapData.passwordEnvelope) {
            // TODO: prompt user for password to unwrap envelope.
            // For now, generate fresh keys as a fallback.
            accountKey = await e2ee.generateAccountKey();
            blindIndexKey = await e2ee.generateBlindIndexKey();
          } else if (bootstrapData.devices?.length > 0) {
            // Another device exists but no password envelope — cannot
            // bootstrap without cross-device key transfer. Generate fresh
            // keys for shadow-write mode.
            accountKey = await e2ee.generateAccountKey();
            blindIndexKey = await e2ee.generateBlindIndexKey();
          } else {
            // First device ever — generate fresh keys.
            accountKey = await e2ee.generateAccountKey();
            blindIndexKey = await e2ee.generateBlindIndexKey();
          }

          const wrappedAccountKey = await e2ee.wrapSymmetricKey(
            accountKey,
            keyPair.publicKey,
          );
          const wrappedSearchKey = await e2ee.wrapSymmetricKey(
            blindIndexKey,
            keyPair.publicKey,
          );

          deviceId = e2ee.generateDeviceId();

          // Export private key for secure storage.
          const crypto = createNativeCryptoProvider();
          const exportedPrivateKey = await crypto.subtle.exportKey(
            "jwk",
            keyPair.privateKey,
          );

          // Register device with backend.
          await fetch(`${apiBaseUrl}/e2ee/device`, {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              deviceId,
              publicKey: publicKeyB64,
              wrappedAccountKey,
              wrappedSearchKey,
            }),
          });

          // Persist keys in secure storage.
          await SecureStore.setItemAsync(
            SECURE_STORE_KEYS.E2EE_DEVICE_ID,
            deviceId,
          );
          await SecureStore.setItemAsync(
            SECURE_STORE_KEYS.E2EE_PRIVATE_KEY,
            JSON.stringify(exportedPrivateKey),
          );

          sessionRef.current = { accountKey, blindIndexKey, deviceId };
        }

        log.info("E2EE bootstrap complete for device", deviceId);
      } catch (error) {
        log.error("E2EE bootstrap failed:", error);
      } finally {
        setIsReady(true);
      }
    },
    [getModule],
  );

  // ── Clear session ──────────────────────────────────────────────────────

  const clearSession = useCallback(() => {
    sessionRef.current = null;
    setIsEnabled(false);
    setIsReady(false);
  }, []);

  // ── E2eeProvider implementation ────────────────────────────────────────

  const provider = useMemo<IE2eeProvider>(() => {
    const getSession = (): E2eeSession | null => sessionRef.current;

    return {
      async attachEventEncryptionShadow<
        T extends CreateEventRequest | UpdateEventRequest,
      >(request: T): Promise<T> {
        const session = getSession();
        if (!session) return request;

        try {
          const e2ee = getModule();
          const payload = {
            title: (request as any).title,
            description: (request as any).description ?? null,
            location: (request as any).location ?? null,
          };

          const encrypted = await e2ee.encryptJsonPayload(
            session.accountKey,
            payload,
            "event-content:v1",
          );

          const blindIndexTokens = (request as any).title
            ? await e2ee.createBlindIndexTokens(
                session.blindIndexKey,
                (request as any).title,
              )
            : [];

          return {
            ...request,
            encryptedContent: JSON.stringify(encrypted),
            blindIndexTokens,
            encryptionState: "shadow_write",
            encryptionKeyVersion: 1,
          } as T;
        } catch (error) {
          log.error("Failed to encrypt event:", error);
          return request;
        }
      },

      async attachCalendarEncryptionShadow<
        T extends CreateCalendarRequest | UpdateCalendarRequest,
      >(request: T): Promise<T> {
        const session = getSession();
        if (!session) return request;

        try {
          const e2ee = getModule();
          const encrypted = await e2ee.encryptJsonPayload(
            session.accountKey,
            { name: (request as any).name },
            "calendar-name:v1",
          );

          const blindIndexTokens = (request as any).name
            ? await e2ee.createBlindIndexTokens(
                session.blindIndexKey,
                (request as any).name,
              )
            : [];

          return {
            ...request,
            encryptedName: JSON.stringify(encrypted),
            blindIndexTokens,
            encryptionState: "shadow_write",
            encryptionKeyVersion: 1,
          } as T;
        } catch (error) {
          log.error("Failed to encrypt calendar:", error);
          return request;
        }
      },

      async attachCategoryEncryptionShadow<
        T extends CreateCategoryRequest | UpdateCategoryRequest,
      >(request: T): Promise<T> {
        const session = getSession();
        if (!session) return request;

        try {
          const e2ee = getModule();
          const encrypted = await e2ee.encryptJsonPayload(
            session.accountKey,
            { name: (request as any).name },
            "category-name:v1",
          );

          const blindIndexTokens = (request as any).name
            ? await e2ee.createBlindIndexTokens(
                session.blindIndexKey,
                (request as any).name,
              )
            : [];

          return {
            ...request,
            encryptedName: JSON.stringify(encrypted),
            blindIndexTokens,
            encryptionState: "shadow_write",
            encryptionKeyVersion: 1,
          } as T;
        } catch (error) {
          log.error("Failed to encrypt category:", error);
          return request;
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

        const session = getSession();
        if (!session) {
          return hydrateEncryptedEventWithoutSession(event);
        }

        try {
          const e2ee = getModule();
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
        if (!session) return [];

        try {
          const e2ee = getModule();
          return e2ee.createBlindIndexTokens(session.blindIndexKey, value);
        } catch {
          return [];
        }
      },
    };
  }, [getModule]);

  // ── Context value ──────────────────────────────────────────────────────

  const value = useMemo<E2eeContextValue>(
    () => ({
      isReady,
      isEnabled,
      provider,
      bootstrap,
      clearSession,
    }),
    [isReady, isEnabled, provider, bootstrap, clearSession],
  );

  return (
    <E2eeContext.Provider value={value}>{children}</E2eeContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useE2ee(): E2eeContextValue {
  const ctx = useContext(E2eeContext);
  if (!ctx) {
    throw new Error("useE2ee must be used within an E2eeProvider");
  }
  return ctx;
}
