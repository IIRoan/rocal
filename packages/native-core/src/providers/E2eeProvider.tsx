import React, {
  createContext,
  use,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createE2eeModule,
  lockWithoutDeviceKeys,
  resolveDeviceEnvelopeSalt,
  type E2eeLock,
  type E2eeModule,
  type E2eeProvider as IE2eeProvider,
  type PasswordEnvelopePayload,
} from "@workspace/e2ee";
import { createNativeCryptoProvider } from "../lib/native-crypto-provider";
import {
  createNativeE2eeProvider,
  fetchE2eeBootstrap,
  putPasswordEnvelope,
  readStoredDevice,
  registerDeviceForSession,
  rememberDeviceEnvelopeSalt,
  unwrapStoredDeviceKeys,
  uploadPasswordEnvelope as uploadPasswordEnvelopeToApi,
  type E2eeSession,
} from "../lib/native-e2ee-provider";
import { calendarApiService } from "../lib/api";
import type { PasswordEnvelopeRequest } from "@workspace/calendar-client";
import { createLogger } from "@workspace/logger";
import { useAuth } from "./AuthProvider";
import { setActiveE2eeSession } from "../lib/e2ee-session";

const log = createLogger("native:e2ee");


export interface E2eeContextValue {
  isReady: boolean;
  isEnabled: boolean;
  provider: IE2eeProvider;
  /** Resolves to a lock when this device cannot open the account key, else null. */
  bootstrap: (userId: string, apiBaseUrl: string) => Promise<E2eeLock | null>;
  /** Wraps the active session's keys to a new sign-in password, once a startup unlock has finished; throws without an unlocked session. */
  createPasswordEnvelope: (password: string) => Promise<PasswordEnvelopePayload>;
  /** Stores an envelope a password change could not, when the API predates storing it with the change. */
  uploadPasswordEnvelope: (envelope: PasswordEnvelopeRequest) => Promise<void>;
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

      await putPasswordEnvelope({ e2ee, session, apiBaseUrl, password });

      clearPendingAuthPassword();
      log.info("Stored native E2EE password envelope for active session", {
        userId,
      });
    },
    [clearPendingAuthPassword],
  );

  const bootstrap = useCallback(
    async (userId: string, apiBaseUrl: string): Promise<E2eeLock | null> => {
      const generation = bootstrapGenerationRef.current + 1;
      bootstrapGenerationRef.current = generation;
      const isStale = () => bootstrapGenerationRef.current !== generation;

      sessionRef.current = null;
      setActiveE2eeSession(null);
      setIsEnabled(false);
      setIsReady(false);
      beginPendingBootstrap();

      try {
        const e2ee = await getModule();

        if (!e2ee) {
          log.warn(
            "E2EE is unavailable in the current runtime. Encryption is disabled for this session.",
          );
          if (!isStale()) {
            setIsReady(true);
          }
          return null;
        }

        const bootstrapData = await fetchE2eeBootstrap(apiBaseUrl);

        if (!bootstrapData) {
          if (!isStale()) {
            setIsReady(true);
          }
          return null;
        }

        if (isStale()) {
          return null;
        }

        setIsEnabled(true);

        const { existingDevice, privateKeyJwk, envelopeSalt } =
          await readStoredDevice(bootstrapData);

        // A stored key that no longer opens counts as no key, so the envelope decides; its server row goes.
        const deviceKeys =
          existingDevice && privateKeyJwk
            ? await unwrapStoredDeviceKeys(e2ee, privateKeyJwk, existingDevice).catch(
                (error: unknown) => {
                  log.warn("Stored E2EE device key no longer opens", {
                    userId,
                    errorName: error instanceof Error ? error.name : typeof error,
                  });
                  void calendarApiService
                    .deleteE2eeDevice(existingDevice.deviceId)
                    .catch(() => undefined);
                  return null;
                },
              )
            : null;

        if (existingDevice && deviceKeys) {
          const { accountKey, blindIndexKey } = deviceKeys;

          if (isStale()) {
            return null;
          }

          sessionRef.current = {
            accountKey,
            blindIndexKey,
            deviceId: existingDevice.deviceId,
            userId,
            apiBaseUrl,
          };
          setActiveE2eeSession(sessionRef.current);
          const pendingPassword = peekPendingAuthPassword();
          // Keys minted while another key's envelope existed must survive sign-out, so a changed envelope is checked again.
          await resolveDeviceEnvelopeSalt(e2ee, {
            storedSalt: envelopeSalt,
            envelope: bootstrapData.passwordEnvelope,
            password: pendingPassword,
            accountKey,
          })
            .then((salt) =>
              salt === envelopeSalt ? undefined : rememberDeviceEnvelopeSalt(salt),
            )
            .catch((error: unknown) => {
              log.warn("Failed to check the device key against the envelope", {
                userId,
                error,
              });
            });
          // An account whose first envelope write failed gets another try whenever the sign-in password is at hand.
          if (!bootstrapData.passwordEnvelope && pendingPassword) {
            await storePasswordEnvelopeForActiveSession({
              e2ee,
              userId,
              apiBaseUrl,
              password: pendingPassword,
            }).catch((error: unknown) => {
              log.warn("Failed to store the missing E2EE password envelope", {
                userId,
                error,
              });
            });
          }
          clearPendingAuthPassword();
          log.info("Restored native E2EE session from existing device", {
            userId,
            deviceId: existingDevice.deviceId,
          });
          return null;
        }

        const pendingPassword = peekPendingAuthPassword();

        if (isStale()) {
          return null;
        }

        // The envelope holds the real account key and only the sign-in password opens it, so nothing here mints keys.
        const envelope = bootstrapData.passwordEnvelope;
        const keys =
          envelope && pendingPassword
            ? await e2ee
                .unwrapPasswordEnvelope(pendingPassword, envelope)
                .catch(() => null)
            : null;
        const lock = lockWithoutDeviceKeys({
          hasEnvelope: Boolean(envelope),
          hasOtherDevices: bootstrapData.devices.length > 0,
          password: pendingPassword ? "sign-in" : "none",
          opened: Boolean(keys),
        });
        if (lock) {
          log.warn("This device cannot open the account key", { userId, lock });
          return isStale() ? null : lock;
        }

        if (envelope && keys) {
          const nextSession = await registerDeviceForSession({
            e2ee,
            userId,
            apiBaseUrl,
            ...keys,
            envelopeSalt: envelope.kdfSalt,
          });

          if (isStale()) {
            return null;
          }

          sessionRef.current = nextSession;
          setActiveE2eeSession(nextSession);
          clearPendingAuthPassword();
          log.info("Unlocked native E2EE with pending auth password", {
            userId,
            deviceId: nextSession.deviceId,
          });
          return null;
        }

        const accountKey = await e2ee.generateAccountKey();
        const blindIndexKey = await e2ee.generateBlindIndexKey();
        // The envelope goes up before the first device, so an interrupted start never leaves keys no sign-in can open.
        const firstEnvelope = pendingPassword
          ? await e2ee.createPasswordEnvelope(
              accountKey,
              blindIndexKey,
              pendingPassword,
            )
          : null;
        if (firstEnvelope) {
          await uploadPasswordEnvelopeToApi(apiBaseUrl, firstEnvelope);
          clearPendingAuthPassword();
        }
        const nextSession = await registerDeviceForSession({
          e2ee,
          userId,
          apiBaseUrl,
          accountKey,
          blindIndexKey,
          envelopeSalt: firstEnvelope?.kdfSalt ?? null,
        });

        if (isStale()) {
          return null;
        }

        sessionRef.current = nextSession;
        setActiveE2eeSession(nextSession);
        return null;
      } catch (error) {
        if (!isStale()) {
          log.error("E2EE bootstrap failed:", error);
        }
      } finally {
        if (!isStale()) {
          finishPendingBootstrap();
          setIsReady(true);
        }
      }
      return null;
    },
    [
      peekPendingAuthPassword,
      clearPendingAuthPassword,
      getModule,
      storePasswordEnvelopeForActiveSession,
      beginPendingBootstrap,
      finishPendingBootstrap,
    ],
  );

  const clearSession = useCallback(() => {
    bootstrapGenerationRef.current += 1;
    sessionRef.current = null;
    setActiveE2eeSession(null);
    finishPendingBootstrap();
    setIsEnabled(false);
    setIsReady(false);
    clearPendingAuthPassword();
  }, [clearPendingAuthPassword, finishPendingBootstrap]);

  const createPasswordEnvelope = useCallback(
    async (password: string) => {
      if (pendingBootstrapRef.current) {
        await pendingBootstrapRef.current;
      }
      const session = sessionRef.current;
      const e2ee = await getModule();
      if (!session || !e2ee) {
        throw new Error("Your encrypted data is not unlocked on this device.");
      }
      return e2ee.createPasswordEnvelope(
        session.accountKey,
        session.blindIndexKey,
        password,
      );
    },
    [getModule],
  );

  const uploadPasswordEnvelope = useCallback(
    async (envelope: PasswordEnvelopeRequest) => {
      const session = sessionRef.current;
      if (!session) {
        throw new Error("Your encrypted data is not unlocked on this device.");
      }
      await uploadPasswordEnvelopeToApi(session.apiBaseUrl, envelope);
    },
    [],
  );

  const provider = useMemo<IE2eeProvider>(
    () =>
      createNativeE2eeProvider({
        getSession: () => sessionRef.current,
        getPendingBootstrap: () => pendingBootstrapRef.current,
        getModule,
      }),
    [getModule],
  );

  const runWithAccountKey = useCallback(
    async <T,>(
      fn: (accountKey: CryptoKey, e2ee: E2eeModule) => Promise<T>,
    ): Promise<T | null> => {
      if (pendingBootstrapRef.current) {
        await pendingBootstrapRef.current;
      }
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
      createPasswordEnvelope,
      uploadPasswordEnvelope,
      clearSession,
      runWithAccountKey,
    }),
    [
      bootstrap,
      clearSession,
      createPasswordEnvelope,
      uploadPasswordEnvelope,
      isEnabled,
      isReady,
      provider,
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
  const ctx = use(E2eeContext);
  if (!ctx) {
    throw new Error("useE2ee must be used within an E2eeProvider");
  }
  return ctx;
}
