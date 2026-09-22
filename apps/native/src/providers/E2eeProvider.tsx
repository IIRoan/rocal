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
  type E2eeModule,
  type E2eeProvider as IE2eeProvider,
} from "@workspace/e2ee";
import { createNativeCryptoProvider } from "../lib/native-crypto-provider";
import {
  createNativeE2eeProvider,
  fetchE2eeBootstrap,
  putPasswordEnvelope,
  readStoredDevice,
  registerDeviceForSession,
  unwrapStoredDeviceKeys,
  type E2eeSession,
} from "../lib/native-e2ee-provider";
import { createLogger } from "@workspace/logger";
import { useAuth } from "./AuthProvider";
import { setActiveE2eeSession } from "../lib/e2ee-session";

const log = createLogger("native:e2ee");


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
    async (userId: string, apiBaseUrl: string) => {
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
          return;
        }

        const bootstrapData = await fetchE2eeBootstrap(apiBaseUrl);

        if (!bootstrapData) {
          if (!isStale()) {
            setIsReady(true);
          }
          return;
        }

        if (!bootstrapData.enabled) {
          log.info("E2EE is not enabled for this user");
          if (!isStale()) {
            setIsReady(true);
          }
          return;
        }

        if (isStale()) {
          return;
        }

        setIsEnabled(true);

        const { existingDevice, privateKeyJwk } =
          await readStoredDevice(bootstrapData);

        if (existingDevice && privateKeyJwk) {
          const { accountKey, blindIndexKey } = await unwrapStoredDeviceKeys(
            e2ee,
            privateKeyJwk,
            existingDevice,
          );

          if (isStale()) {
            return;
          }

          sessionRef.current = {
            accountKey,
            blindIndexKey,
            deviceId: existingDevice.deviceId,
            userId,
            apiBaseUrl,
          };
          setActiveE2eeSession(sessionRef.current);
          clearPendingAuthPassword();
          log.info("Restored native E2EE session from existing device", {
            userId,
            deviceId: existingDevice.deviceId,
          });
          return;
        }

        const pendingPassword = peekPendingAuthPassword();

        // New-device email/password users unlock the envelope with the password captured at sign-in.
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

            if (isStale()) {
              return;
            }

            sessionRef.current = nextSession;
            setActiveE2eeSession(nextSession);
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

        if (isStale()) {
          return;
        }

        // Otherwise start a fresh device session; other devices' content stays a placeholder until re-keyed.
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

        if (isStale()) {
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
            // Drop the sign-in password even when the envelope write failed.
            clearPendingAuthPassword();
          }
        }

        return;
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
  const ctx = use(E2eeContext);
  if (!ctx) {
    throw new Error("useE2ee must be used within an E2eeProvider");
  }
  return ctx;
}
