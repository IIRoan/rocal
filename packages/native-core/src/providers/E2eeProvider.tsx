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
  resolveDeviceEnvelopeSalt,
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
  rememberDeviceEnvelopeSalt,
  unwrapStoredDeviceKeys,
  type E2eeSession,
} from "../lib/native-e2ee-provider";
import type { E2eeBootstrapResponse } from "@workspace/calendar-core";
import { createLogger } from "@workspace/logger";
import { useAuth } from "./AuthProvider";
import { setActiveE2eeSession } from "../lib/e2ee-session";

const log = createLogger("native:e2ee");

export interface E2eeContextValue {
  isReady: boolean;
  isEnabled: boolean;
  provider: IE2eeProvider;
  /** Resolves true when the account key waits for the encryption password on this device. */
  bootstrap: (userId: string, apiBaseUrl: string) => Promise<boolean>;
  /** The account has a password envelope this device could not open with the sign-in password. */
  needsPassword: boolean;
  /** Opens the envelope and registers this device; false when the password is wrong. */
  unlockWithPassword: (password: string) => Promise<boolean>;
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
  const [needsPassword, setNeedsPassword] = useState(false);
  const lockedRef = useRef<{
    userId: string;
    apiBaseUrl: string;
    envelope: NonNullable<E2eeBootstrapResponse["passwordEnvelope"]>;
  } | null>(null);

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
    async (userId: string, apiBaseUrl: string): Promise<boolean> => {
      const generation = bootstrapGenerationRef.current + 1;
      bootstrapGenerationRef.current = generation;
      const isStale = () => bootstrapGenerationRef.current !== generation;

      sessionRef.current = null;
      lockedRef.current = null;
      setActiveE2eeSession(null);
      setIsEnabled(false);
      setIsReady(false);
      setNeedsPassword(false);
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
          return false;
        }

        const bootstrapData = await fetchE2eeBootstrap(apiBaseUrl);

        if (!bootstrapData) {
          if (!isStale()) {
            setIsReady(true);
          }
          return false;
        }

        if (isStale()) {
          return false;
        }

        setIsEnabled(true);

        const { existingDevice, privateKeyJwk, envelopeSalt } =
          await readStoredDevice(bootstrapData);

        if (existingDevice && privateKeyJwk) {
          const { accountKey, blindIndexKey } = await unwrapStoredDeviceKeys(
            e2ee,
            privateKeyJwk,
            existingDevice,
          );

          if (isStale()) {
            return false;
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
          return false;
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
              envelopeSalt: bootstrapData.passwordEnvelope.kdfSalt,
            });

            if (isStale()) {
              return false;
            }

            sessionRef.current = nextSession;
            setActiveE2eeSession(nextSession);
            clearPendingAuthPassword();
            log.info("Unlocked native E2EE with pending auth password", {
              userId,
              deviceId: nextSession.deviceId,
            });
            return false;
          } catch (error) {
            log.warn("Pending auth password did not unlock E2EE envelope", {
              userId,
              error,
            });
          }
        }

        if (isStale()) {
          return false;
        }

        // The envelope holds the real account key, so a missing or wrong password waits for the unlock prompt instead of minting keys.
        if (bootstrapData.passwordEnvelope) {
          // The sign-in password stays in memory so the envelope can be re-wrapped to it after the unlock.
          lockedRef.current = {
            userId,
            apiBaseUrl,
            envelope: bootstrapData.passwordEnvelope,
          };
          setNeedsPassword(true);
          return true;
        }

        // Without an envelope the keys live only on other devices; fresh keys here would orphan their content.
        if (bootstrapData.devices.length > 0) {
          log.warn("E2EE devices exist without a password envelope; this device cannot unlock", {
            userId,
          });
          return false;
        }

        const accountKey = await e2ee.generateAccountKey();
        const blindIndexKey = await e2ee.generateBlindIndexKey();
        const nextSession = await registerDeviceForSession({
          e2ee,
          userId,
          apiBaseUrl,
          accountKey,
          blindIndexKey,
          envelopeSalt: null,
        });

        if (isStale()) {
          return false;
        }

        sessionRef.current = nextSession;
        setActiveE2eeSession(nextSession);

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

        return false;
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
      return false;
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
    lockedRef.current = null;
    setNeedsPassword(false);
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

  const unlockWithPassword = useCallback(
    async (password: string) => {
      const locked = lockedRef.current;
      if (!locked) {
        return false;
      }
      const e2ee = await getModule();
      if (!e2ee) {
        return false;
      }
      const keys = await e2ee
        .unwrapPasswordEnvelope(password, locked.envelope)
        .catch(() => null);
      if (!keys) {
        return false;
      }
      const nextSession = await registerDeviceForSession({
        e2ee,
        userId: locked.userId,
        apiBaseUrl: locked.apiBaseUrl,
        ...keys,
        envelopeSalt: locked.envelope.kdfSalt,
      });
      // A sign-out or new bootstrap during the unlock leaves the newer state alone.
      const current = lockedRef.current === locked;
      if (current) {
        lockedRef.current = null;
        sessionRef.current = nextSession;
        setActiveE2eeSession(nextSession);
        setNeedsPassword(false);
        log.info("Unlocked native E2EE with the encryption password", {
          userId: locked.userId,
          deviceId: nextSession.deviceId,
        });
        // After a reset the sign-in password differs from the one just entered, so the envelope follows it.
        const signInPassword = peekPendingAuthPassword();
        if (signInPassword && signInPassword !== password) {
          await storePasswordEnvelopeForActiveSession({
            e2ee,
            userId: locked.userId,
            apiBaseUrl: locked.apiBaseUrl,
            password: signInPassword,
          }).catch((error: unknown) => {
            log.warn("Failed to re-wrap the E2EE envelope to the sign-in password", {
              userId: locked.userId,
              error,
            });
          });
        }
        clearPendingAuthPassword();
      }
      return current;
    },
    [
      clearPendingAuthPassword,
      getModule,
      peekPendingAuthPassword,
      storePasswordEnvelopeForActiveSession,
    ],
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
      needsPassword,
      provider,
      bootstrap,
      unlockWithPassword,
      resetEncryptionPassword,
      clearSession,
      runWithAccountKey,
    }),
    [
      bootstrap,
      clearSession,
      isEnabled,
      isReady,
      needsPassword,
      provider,
      resetEncryptionPassword,
      runWithAccountKey,
      unlockWithPassword,
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
